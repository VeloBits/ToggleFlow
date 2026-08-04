import { flagType, jsonValueSchema, targetingRuleSchema } from '@toggleflow/engine';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { resolveEnvironment, resolveTool } from '../auth/rbac';
import { flagStates, tools } from '../db/schema';
import { writeAudit } from '../lib/audit';
import { badRequest, notFound } from '../lib/errors';
import { parseServedValue } from '../lib/flag-values';

const environmentParams = z.object({ environmentId: z.uuid() });
const flagParams = z.object({ environmentId: z.uuid(), toolId: z.uuid() });

/**
 * Static and permissive on `value` on purpose: for a `string_enum` flag the set
 * of legal values lives on the flag row, so the schema that can judge a value
 * does not exist until the tool has been loaded. Shape is checked here, type
 * conformance in the handler once the definition is in hand.
 */
const flagPatchBody = z
  .object({
    enabled: z.boolean(),
    value: jsonValueSchema,
    rolloutPercent: z.number().int().min(0).max(100).nullable(),
    targetingRules: z.array(targetingRuleSchema).max(100),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'at least one field required');

export function registerFlagRoutes(app: FastifyInstance): void {
  app.get('/v1/environments/:environmentId/flags', async (req) => {
    const { environmentId } = environmentParams.parse(req.params);
    await resolveEnvironment(app.db, req.auth, environmentId, 'viewer');
    return app.db
      .select({
        toolId: flagStates.toolId,
        toolKey: tools.key,
        toolName: tools.name,
        archived: tools.archived,
        // The definition half of a typed flag (project-scoped, from `tools`)
        // travels with the per-environment half so the flags table can render a
        // value control without a second round trip per row.
        valueType: tools.valueType,
        enumOptions: tools.enumOptions,
        defaultValue: tools.defaultValue,
        enabled: flagStates.enabled,
        value: flagStates.value,
        rolloutPercent: flagStates.rolloutPercent,
        targetingRules: flagStates.targetingRules,
        updatedAt: flagStates.updatedAt,
      })
      .from(flagStates)
      .innerJoin(tools, eq(tools.id, flagStates.toolId))
      .where(eq(flagStates.environmentId, environmentId))
      .orderBy(asc(tools.key));
  });

  app.patch('/v1/environments/:environmentId/tools/:toolId/flag', async (req) => {
    const { environmentId, toolId } = flagParams.parse(req.params);
    const body = flagPatchBody.parse(req.body);
    const envScope = await resolveEnvironment(app.db, req.auth, environmentId, 'developer');
    const toolScope = await resolveTool(app.db, req.auth, toolId, 'developer');
    if (toolScope.projectId !== envScope.projectId) throw notFound('tool');

    /*
     * Stage two of the validation: `resolveTool` answers "may this caller touch
     * this tool" and returns ids only, so the flag's type comes from its own
     * select. Cheap, and it keeps the RBAC helper about access rather than
     * accumulating whatever columns each route happens to need.
     */
    const [definition] = await app.db
      .select({ valueType: tools.valueType, enumOptions: tools.enumOptions })
      .from(tools)
      .where(eq(tools.id, toolId));
    if (!definition) throw notFound('tool');
    const descriptor = flagType(definition.valueType);

    if (descriptor.derivesFromEnabled) {
      // Rejected rather than ignored: a caller who sends a value and gets a 200
      // back believes the flag now serves it.
      if ('value' in body) throw badRequest('boolean flags carry no value; use `enabled`');
    } else {
      if ('value' in body) parseServedValue(definition, body.value);
      for (const rule of body.targetingRules ?? []) {
        if (rule.value !== undefined) parseServedValue(definition, rule.value);
      }
    }

    const state = await app.db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(flagStates)
        .where(and(eq(flagStates.toolId, toolId), eq(flagStates.environmentId, environmentId)));

      const [after] = await tx
        .insert(flagStates)
        .values({ toolId, environmentId, ...body })
        .onConflictDoUpdate({
          target: [flagStates.toolId, flagStates.environmentId],
          set: { ...body, updatedAt: new Date() },
        })
        .returning();

      await writeAudit(tx, {
        orgId: envScope.orgId,
        actorId: req.auth.user.id,
        action: 'flag.update',
        entityType: 'flag_state',
        entityId: after?.id,
        before: before
          ? {
              enabled: before.enabled,
              value: before.value,
              rolloutPercent: before.rolloutPercent,
              targetingRules: before.targetingRules,
            }
          : null,
        after: body,
      });
      return after;
    });
    app.publisher.scheduleRuleset(environmentId);
    return state;
  });
}
