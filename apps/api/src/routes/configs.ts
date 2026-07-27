import { jsonObjectSchema } from '@toggleflow/engine';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { resolveEnvironment, resolveTool } from '../auth/rbac';
import { configVersions, toolConfigs } from '../db/schema';
import { writeAudit } from '../lib/audit';
import { badRequest, notFound } from '../lib/errors';
import { publishEnvironment } from '../lib/publish';

const configParams = z.object({ environmentId: z.uuid(), toolId: z.uuid() });
const configPutBody = z.object({ value: jsonObjectSchema });
const rollbackBody = z.object({ toVersion: z.number().int().min(1) });

async function resolveConfigScope(
  app: FastifyInstance,
  req: { auth: Parameters<typeof resolveEnvironment>[1] },
  environmentId: string,
  toolId: string,
  min: 'viewer' | 'developer',
) {
  const envScope = await resolveEnvironment(app.db, req.auth, environmentId, min);
  const toolScope = await resolveTool(app.db, req.auth, toolId, min);
  if (toolScope.projectId !== envScope.projectId) throw notFound('tool');
  return envScope;
}

export function registerConfigRoutes(app: FastifyInstance): void {
  app.get('/v1/environments/:environmentId/tools/:toolId/config', async (req) => {
    const { environmentId, toolId } = configParams.parse(req.params);
    await resolveConfigScope(app, req, environmentId, toolId, 'viewer');
    const [config] = await app.db
      .select()
      .from(toolConfigs)
      .where(and(eq(toolConfigs.toolId, toolId), eq(toolConfigs.environmentId, environmentId)));
    return config ?? { toolId, environmentId, value: null, version: 0 };
  });

  app.put('/v1/environments/:environmentId/tools/:toolId/config', async (req) => {
    const { environmentId, toolId } = configParams.parse(req.params);
    const body = configPutBody.parse(req.body);
    const scope = await resolveConfigScope(app, req, environmentId, toolId, 'developer');

    const config = await app.db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(toolConfigs)
        .where(and(eq(toolConfigs.toolId, toolId), eq(toolConfigs.environmentId, environmentId)));

      const [after] = await tx
        .insert(toolConfigs)
        .values({ toolId, environmentId, value: body.value, version: 1 })
        .onConflictDoUpdate({
          target: [toolConfigs.toolId, toolConfigs.environmentId],
          set: {
            value: body.value,
            version: sql`${toolConfigs.version} + 1`,
            updatedAt: new Date(),
          },
        })
        .returning();
      if (!after) throw new Error('config upsert failed');

      await tx.insert(configVersions).values({
        toolConfigId: after.id,
        version: after.version,
        value: body.value,
        authorId: req.auth.user.id,
      });
      await writeAudit(tx, {
        orgId: scope.orgId,
        actorId: req.auth.user.id,
        action: 'config.update',
        entityType: 'tool_config',
        entityId: after.id,
        before: before ? { value: before.value, version: before.version } : null,
        after: { value: body.value, version: after.version },
      });
      return after;
    });
    await publishEnvironment(environmentId);
    return config;
  });

  app.get('/v1/environments/:environmentId/tools/:toolId/config/versions', async (req) => {
    const { environmentId, toolId } = configParams.parse(req.params);
    await resolveConfigScope(app, req, environmentId, toolId, 'viewer');
    const [config] = await app.db
      .select({ id: toolConfigs.id })
      .from(toolConfigs)
      .where(and(eq(toolConfigs.toolId, toolId), eq(toolConfigs.environmentId, environmentId)));
    if (!config) return [];
    return app.db
      .select()
      .from(configVersions)
      .where(eq(configVersions.toolConfigId, config.id))
      .orderBy(desc(configVersions.version));
  });

  /** One-click rollback: a NEW version copying an old one — history stays append-only. */
  app.post('/v1/environments/:environmentId/tools/:toolId/config/rollback', async (req) => {
    const { environmentId, toolId } = configParams.parse(req.params);
    const body = rollbackBody.parse(req.body);
    const scope = await resolveConfigScope(app, req, environmentId, toolId, 'developer');

    const config = await app.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(toolConfigs)
        .where(and(eq(toolConfigs.toolId, toolId), eq(toolConfigs.environmentId, environmentId)));
      if (!current) throw notFound('config');
      if (body.toVersion === current.version) {
        throw badRequest('already at that version');
      }
      const [target] = await tx
        .select()
        .from(configVersions)
        .where(
          and(
            eq(configVersions.toolConfigId, current.id),
            eq(configVersions.version, body.toVersion),
          ),
        );
      if (!target) throw notFound('config version');

      const [after] = await tx
        .update(toolConfigs)
        .set({ value: target.value, version: current.version + 1, updatedAt: new Date() })
        .where(eq(toolConfigs.id, current.id))
        .returning();
      if (!after) throw new Error('config rollback failed');

      await tx.insert(configVersions).values({
        toolConfigId: current.id,
        version: after.version,
        value: target.value,
        authorId: req.auth.user.id,
        restoredFromVersion: body.toVersion,
      });
      await writeAudit(tx, {
        orgId: scope.orgId,
        actorId: req.auth.user.id,
        action: 'config.rollback',
        entityType: 'tool_config',
        entityId: current.id,
        before: { value: current.value, version: current.version },
        after: { value: target.value, version: after.version, restoredFromVersion: body.toVersion },
      });
      return after;
    });
    await publishEnvironment(environmentId);
    return config;
  });
}
