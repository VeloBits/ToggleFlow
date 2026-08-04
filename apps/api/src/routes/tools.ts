import { flagType, jsonObjectSchema } from '@toggleflow/engine';
import { and, asc, eq, ilike, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { resolveProject, resolveTool } from '../auth/rbac';
import {
  configVersions,
  environments,
  flagStates,
  toolConfigs,
  tools,
  type Tool,
} from '../db/schema';
import { writeAudit } from '../lib/audit';
import { badRequest, notFound } from '../lib/errors';
import {
  assertOptionRemovalSafe,
  assertUniqueOptions,
  flagDefinitionFields,
  flagDefinitionPatchFields,
  flagManifestFields,
  parseServedValue,
  validateFlagDefinition,
  type EnvironmentFlagValues,
  type FlagDefinitionColumns,
} from '../lib/flag-values';

const projectParams = z.object({ projectId: z.uuid() });
const toolParams = z.object({ toolId: z.uuid() });

const toolKey = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9][a-z0-9._-]*$/, 'lowercase letters, digits, dots, dashes, underscores only');

const toolCreateBody = z.object({
  key: toolKey,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  tags: z.array(z.string().min(1).max(50)).max(50).default([]),
  metadata: jsonObjectSchema.default({}),
  ...flagDefinitionFields,
});

/**
 * `valueType` is deliberately NOT here: a flag's type is immutable after
 * creation, and the route rejects the field outright rather than ignoring it
 * (see the guard in PATCH /v1/tools/:toolId).
 */
const toolPatchBody = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullable(),
    tags: z.array(z.string().min(1).max(50)).max(50),
    metadata: jsonObjectSchema,
    archived: z.boolean(),
    ...flagDefinitionPatchFields,
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'at least one field required');

const toolListQuery = z.object({
  search: z.string().max(200).optional(),
  tag: z.string().max(50).optional(),
  includeArchived: z.coerce.boolean().default(false),
});

const bulkBody = z.object({
  tools: z
    .array(
      z.object({
        key: toolKey,
        name: z.string().min(1).max(200),
        description: z.string().max(2000).nullish(),
        tags: z.array(z.string().min(1).max(50)).max(50).default([]),
        metadata: jsonObjectSchema.default({}),
        ...flagManifestFields,
        /** Seeded as config v1 in every environment when the tool is CREATED; never overwrites live config. */
        defaultConfig: jsonObjectSchema.optional(),
      }),
    )
    .min(1)
    .max(1000),
  /** Archive registry tools missing from this manifest (the CLI sync semantics). */
  archiveMissing: z.boolean().default(false),
});

async function projectEnvironmentIds(db: FastifyInstance['db'], projectId: string) {
  const rows = await db
    .select({ id: environments.id })
    .from(environments)
    .where(eq(environments.projectId, projectId));
  return rows.map((r) => r.id);
}

/**
 * What the tool currently serves in each environment - the input to the
 * enum-option removal guard. One row per environment, so it stays cheap enough
 * to run on every option edit.
 */
async function toolEnvironmentValues(
  db: FastifyInstance['db'],
  toolId: string,
): Promise<EnvironmentFlagValues[]> {
  return db
    .select({
      environmentKey: environments.key,
      value: flagStates.value,
      targetingRules: flagStates.targetingRules,
    })
    .from(flagStates)
    .innerJoin(environments, eq(environments.id, flagStates.environmentId))
    .where(eq(flagStates.toolId, toolId));
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function registerToolRoutes(app: FastifyInstance): void {
  app.get('/v1/projects/:projectId/tools', async (req) => {
    const { projectId } = projectParams.parse(req.params);
    const query = toolListQuery.parse(req.query);
    await resolveProject(app.db, req.auth, projectId, 'viewer');

    const conditions = [eq(tools.projectId, projectId)];
    if (!query.includeArchived) conditions.push(eq(tools.archived, false));
    if (query.search) {
      const pattern = `%${query.search}%`;
      const match = or(ilike(tools.key, pattern), ilike(tools.name, pattern));
      if (match) conditions.push(match);
    }
    const rows = await app.db
      .select()
      .from(tools)
      .where(and(...conditions))
      .orderBy(asc(tools.key));
    return query.tag ? rows.filter((t) => t.tags.includes(query.tag as string)) : rows;
  });

  app.post('/v1/projects/:projectId/tools', async (req, reply) => {
    const { projectId } = projectParams.parse(req.params);
    const body = toolCreateBody.parse(req.body);
    const scope = await resolveProject(app.db, req.auth, projectId, 'developer');
    const definition = validateFlagDefinition(body);

    const envIds = await projectEnvironmentIds(app.db, projectId);
    const tool = await app.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(tools)
        .values({
          projectId,
          key: body.key,
          name: body.name,
          description: body.description ?? null,
          tags: body.tags,
          metadata: body.metadata,
          ...definition,
        })
        .returning();
      if (!row) throw new Error('tool insert failed');
      if (envIds.length > 0) {
        // Seeded from the definition default so a new flag serves the same value
        // everywhere on day one; null for boolean flags, whose value is `enabled`.
        await tx
          .insert(flagStates)
          .values(
            envIds.map((environmentId) => ({
              toolId: row.id,
              environmentId,
              value: row.defaultValue,
            })),
          )
          .onConflictDoNothing();
      }
      await writeAudit(tx, {
        orgId: scope.orgId,
        actorId: req.auth.user.id,
        action: 'tool.create',
        entityType: 'tool',
        entityId: row.id,
        after: { key: row.key, name: row.name, valueType: row.valueType },
      });
      return row;
    });
    for (const environmentId of envIds) app.publisher.scheduleRuleset(environmentId);
    return reply.status(201).send(tool);
  });

  app.get('/v1/tools/:toolId', async (req) => {
    const { toolId } = toolParams.parse(req.params);
    await resolveTool(app.db, req.auth, toolId, 'viewer');
    const [tool] = await app.db.select().from(tools).where(eq(tools.id, toolId));
    if (!tool) throw notFound('tool');
    const states = await app.db
      .select({
        environmentId: flagStates.environmentId,
        environmentKey: environments.key,
        enabled: flagStates.enabled,
        // The dashboard's per-environment matrix renders the value beside the
        // toggle, so it has to come back with the state, not just the definition.
        value: flagStates.value,
        rolloutPercent: flagStates.rolloutPercent,
        targetingRules: flagStates.targetingRules,
        updatedAt: flagStates.updatedAt,
      })
      .from(flagStates)
      .innerJoin(environments, eq(environments.id, flagStates.environmentId))
      .where(eq(flagStates.toolId, toolId))
      .orderBy(asc(environments.createdAt));
    return { ...tool, flagStates: states };
  });

  app.patch('/v1/tools/:toolId', async (req) => {
    const { toolId } = toolParams.parse(req.params);
    /*
     * Rejected before the body is even parsed, because zod strips unknown keys:
     * silently ignoring a `valueType` would let a caller believe the type
     * changed. And it must never change - it orphans every `flag_states.value`
     * and every targeting-rule value the flag has, in every environment, and
     * every already-deployed SDK call site that reads it as its old type. A new
     * flag beside it is a migration a team can roll out; a mutated type is a
     * fleet-wide breakage with no rollback.
     */
    if (req.body !== null && typeof req.body === 'object' && 'valueType' in req.body) {
      throw badRequest("a flag's type cannot be changed; create a new flag");
    }
    const body = toolPatchBody.parse(req.body);
    const scope = await resolveTool(app.db, req.auth, toolId, 'developer');

    const [current] = await app.db.select().from(tools).where(eq(tools.id, toolId));
    if (!current) throw notFound('tool');

    /*
     * Everything type-aware is validated against the definition this PATCH
     * leaves behind, not the stored one - a single request may legitimately drop
     * an option and move the default onto a surviving one.
     */
    const descriptor = flagType(current.valueType);
    if (descriptor.derivesFromEnabled && 'defaultValue' in body) {
      throw badRequest('boolean flags carry no default value; their value is `enabled`');
    }
    const nextOptions = body.enumOptions ?? current.enumOptions;
    const patch = { ...body };
    if ('defaultValue' in body) {
      patch.defaultValue = parseServedValue(
        { valueType: current.valueType, enumOptions: nextOptions },
        body.defaultValue,
      );
    }
    if (body.enumOptions) {
      if (descriptor.requiresOptions && nextOptions.length === 0) {
        throw badRequest('string_enum flags need at least one option');
      }
      assertUniqueOptions(nextOptions);
      assertOptionRemovalSafe({
        currentOptions: current.enumOptions,
        nextOptions,
        defaultValue: 'defaultValue' in body ? patch.defaultValue! : current.defaultValue,
        states: await toolEnvironmentValues(app.db, toolId),
      });
    }

    const tool = await app.db.transaction(async (tx) => {
      const [before] = await tx.select().from(tools).where(eq(tools.id, toolId));
      if (!before) throw notFound('tool');
      const [after] = await tx.update(tools).set(patch).where(eq(tools.id, toolId)).returning();
      await writeAudit(tx, {
        orgId: scope.orgId,
        actorId: req.auth.user.id,
        action: 'tool.update',
        entityType: 'tool',
        entityId: toolId,
        before: {
          name: before.name,
          description: before.description,
          tags: before.tags,
          metadata: before.metadata,
          archived: before.archived,
          enumOptions: before.enumOptions,
          defaultValue: before.defaultValue,
        },
        after: patch,
      });
      return after;
    });
    const envIds = await projectEnvironmentIds(app.db, scope.projectId);
    for (const environmentId of envIds) app.publisher.scheduleRuleset(environmentId);
    return tool;
  });

  app.delete('/v1/tools/:toolId', async (req, reply) => {
    const { toolId } = toolParams.parse(req.params);
    const scope = await resolveTool(app.db, req.auth, toolId, 'admin');

    await app.db.transaction(async (tx) => {
      const [before] = await tx.select().from(tools).where(eq(tools.id, toolId));
      if (!before) throw notFound('tool');
      await tx.delete(tools).where(eq(tools.id, toolId));
      await writeAudit(tx, {
        orgId: scope.orgId,
        actorId: req.auth.user.id,
        action: 'tool.delete',
        entityType: 'tool',
        entityId: toolId,
        before: { key: before.key, name: before.name },
      });
    });
    const envIds = await projectEnvironmentIds(app.db, scope.projectId);
    for (const environmentId of envIds) app.publisher.scheduleRuleset(environmentId);
    return reply.status(204).send();
  });

  /**
   * Bulk upsert - the CLI-sync target (roadmap decision 1.1). Idempotent:
   * unchanged entries are counted, not rewritten. With archiveMissing=true,
   * registry tools absent from the manifest are archived (never deleted).
   */
  app.put('/v1/projects/:projectId/tools/bulk', async (req) => {
    const { projectId } = projectParams.parse(req.params);
    const body = bulkBody.parse(req.body);
    const scope = await resolveProject(app.db, req.auth, projectId, 'developer');

    const keys = body.tools.map((t) => t.key);
    if (new Set(keys).size !== keys.length) {
      throw badRequest('duplicate tool keys in manifest');
    }

    /*
     * Definition pre-pass, deliberately outside the write transaction: every
     * reason to reject a manifest is found before a single row is written, and
     * the enum-option guard needs a per-tool query that has no business running
     * inside the transaction that holds the writes. Only tools whose options
     * actually changed are queried, so a 1000-entry no-op manifest costs one
     * extra select in total.
     */
    const registry = await app.db.select().from(tools).where(eq(tools.projectId, projectId));
    const registryByKey = new Map<string, Tool>(registry.map((t) => [t.key, t]));
    const definitions = new Map<string, FlagDefinitionColumns>();
    for (const entry of body.tools) {
      const current = registryByKey.get(entry.key);
      const definition = validateFlagDefinition({
        valueType: entry.valueType ?? current?.valueType ?? 'boolean',
        enumOptions: entry.enumOptions ?? current?.enumOptions ?? [],
        defaultValue:
          'defaultValue' in entry ? entry.defaultValue : (current?.defaultValue ?? undefined),
      });
      definitions.set(entry.key, definition);
      if (!current) continue;
      // Same rule as PATCH, and for the same reason: a type change orphans every
      // stored value and every deployed call site. A manifest that omits
      // valueType is not asking for one (see flagManifestFields).
      if (entry.valueType && entry.valueType !== current.valueType) {
        throw badRequest(
          `${entry.key}: a flag's type cannot be changed (${current.valueType} → ${entry.valueType}); create a new flag`,
        );
      }
      if (entry.enumOptions && !sameJson(definition.enumOptions, current.enumOptions)) {
        assertOptionRemovalSafe({
          currentOptions: current.enumOptions,
          nextOptions: definition.enumOptions,
          defaultValue: definition.defaultValue,
          states: await toolEnvironmentValues(app.db, current.id),
        });
      }
    }

    const envIds = await projectEnvironmentIds(app.db, projectId);
    const result = await app.db.transaction(async (tx) => {
      const existing = await tx.select().from(tools).where(eq(tools.projectId, projectId));
      const byKey = new Map<string, Tool>(existing.map((t) => [t.key, t]));
      const created: string[] = [];
      const updated: string[] = [];
      const archived: string[] = [];
      let unchanged = 0;

      for (const entry of body.tools) {
        const definition = definitions.get(entry.key)!;
        const current = byKey.get(entry.key);
        if (!current) {
          const [row] = await tx
            .insert(tools)
            .values({
              projectId,
              key: entry.key,
              name: entry.name,
              description: entry.description ?? null,
              tags: entry.tags,
              metadata: entry.metadata,
              ...definition,
            })
            .returning();
          if (!row) throw new Error('tool insert failed');
          if (envIds.length > 0) {
            // Same seeding rule as single-tool create: every environment starts
            // on the definition's default value.
            await tx
              .insert(flagStates)
              .values(
                envIds.map((environmentId) => ({
                  toolId: row.id,
                  environmentId,
                  value: row.defaultValue,
                })),
              )
              .onConflictDoNothing();
          }
          if (entry.defaultConfig) {
            for (const environmentId of envIds) {
              const [config] = await tx
                .insert(toolConfigs)
                .values({ toolId: row.id, environmentId, value: entry.defaultConfig, version: 1 })
                .returning();
              if (config) {
                await tx.insert(configVersions).values({
                  toolConfigId: config.id,
                  version: 1,
                  value: entry.defaultConfig,
                  authorId: req.auth.user.id,
                });
              }
            }
          }
          created.push(entry.key);
          continue;
        }

        const patch: Partial<typeof current> = {};
        if (entry.name !== current.name) patch.name = entry.name;
        const description = entry.description ?? null;
        if (description !== current.description) patch.description = description;
        if (!sameJson(entry.tags, current.tags)) patch.tags = entry.tags;
        if (!sameJson(entry.metadata, current.metadata)) patch.metadata = entry.metadata;
        // Only what the manifest actually declared: an omitted field means "no
        // opinion", never "reset to the type default".
        if (entry.enumOptions && !sameJson(definition.enumOptions, current.enumOptions)) {
          patch.enumOptions = definition.enumOptions;
        }
        if ('defaultValue' in entry && !sameJson(definition.defaultValue, current.defaultValue)) {
          patch.defaultValue = definition.defaultValue;
        }
        if (current.archived) patch.archived = false;

        if (Object.keys(patch).length > 0) {
          await tx.update(tools).set(patch).where(eq(tools.id, current.id));
          updated.push(entry.key);
        } else {
          unchanged++;
        }
      }

      if (body.archiveMissing) {
        const manifestKeys = new Set(keys);
        for (const current of existing) {
          if (!manifestKeys.has(current.key) && !current.archived) {
            await tx.update(tools).set({ archived: true }).where(eq(tools.id, current.id));
            archived.push(current.key);
          }
        }
      }

      await writeAudit(tx, {
        orgId: scope.orgId,
        actorId: req.auth.user.id,
        action: 'tool.bulk_upsert',
        entityType: 'project',
        entityId: projectId,
        after: { created, updated, archived, unchanged, archiveMissing: body.archiveMissing },
      });
      return { created, updated, archived, unchanged };
    });
    for (const environmentId of envIds) app.publisher.scheduleRuleset(environmentId);
    return result;
  });
}
