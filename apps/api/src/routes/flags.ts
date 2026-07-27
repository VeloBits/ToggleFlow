import { targetingRuleSchema } from '@toggleflow/engine';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { resolveEnvironment, resolveTool } from '../auth/rbac';
import { flagStates, tools } from '../db/schema';
import { writeAudit } from '../lib/audit';
import { notFound } from '../lib/errors';
import { publishEnvironment } from '../lib/publish';

const environmentParams = z.object({ environmentId: z.uuid() });
const flagParams = z.object({ environmentId: z.uuid(), toolId: z.uuid() });

const flagPatchBody = z
  .object({
    enabled: z.boolean(),
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
        enabled: flagStates.enabled,
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
              rolloutPercent: before.rolloutPercent,
              targetingRules: before.targetingRules,
            }
          : null,
        after: body,
      });
      return after;
    });
    await publishEnvironment(environmentId);
    return state;
  });
}
