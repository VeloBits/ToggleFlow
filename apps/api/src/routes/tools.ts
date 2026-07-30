import { jsonObjectSchema } from '@toggleflow/engine';
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
});

const toolPatchBody = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullable(),
    tags: z.array(z.string().min(1).max(50)).max(50),
    metadata: jsonObjectSchema,
    archived: z.boolean(),
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
        })
        .returning();
      if (!row) throw new Error('tool insert failed');
      if (envIds.length > 0) {
        await tx
          .insert(flagStates)
          .values(envIds.map((environmentId) => ({ toolId: row.id, environmentId })))
          .onConflictDoNothing();
      }
      await writeAudit(tx, {
        orgId: scope.orgId,
        actorId: req.auth.user.id,
        action: 'tool.create',
        entityType: 'tool',
        entityId: row.id,
        after: { key: row.key, name: row.name },
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
    const body = toolPatchBody.parse(req.body);
    const scope = await resolveTool(app.db, req.auth, toolId, 'developer');

    const tool = await app.db.transaction(async (tx) => {
      const [before] = await tx.select().from(tools).where(eq(tools.id, toolId));
      if (!before) throw notFound('tool');
      const [after] = await tx.update(tools).set(body).where(eq(tools.id, toolId)).returning();
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
        },
        after: body,
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

    const envIds = await projectEnvironmentIds(app.db, projectId);
    const result = await app.db.transaction(async (tx) => {
      const existing = await tx.select().from(tools).where(eq(tools.projectId, projectId));
      const byKey = new Map<string, Tool>(existing.map((t) => [t.key, t]));
      const created: string[] = [];
      const updated: string[] = [];
      const archived: string[] = [];
      let unchanged = 0;

      for (const entry of body.tools) {
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
            })
            .returning();
          if (!row) throw new Error('tool insert failed');
          if (envIds.length > 0) {
            await tx
              .insert(flagStates)
              .values(envIds.map((environmentId) => ({ toolId: row.id, environmentId })))
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
