import { conditionSchema } from '@toggleflow/engine';
import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { resolveProject, resolveSegment } from '../auth/rbac';
import { environments, segments } from '../db/schema';
import { writeAudit } from '../lib/audit';
import { notFound } from '../lib/errors';
import { publishEnvironment } from '../lib/publish';

const projectParams = z.object({ projectId: z.uuid() });
const segmentParams = z.object({ segmentId: z.uuid() });

const segmentKey = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9][a-z0-9._-]*$/, 'lowercase letters, digits, dots, dashes, underscores only');

const segmentCreateBody = z.object({
  key: segmentKey,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  rules: z.array(conditionSchema).max(100).default([]),
});

const segmentPatchBody = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullable(),
    rules: z.array(conditionSchema).max(100),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'at least one field required');

async function publishProjectEnvironments(app: FastifyInstance, projectId: string) {
  const rows = await app.db
    .select({ id: environments.id })
    .from(environments)
    .where(eq(environments.projectId, projectId));
  await Promise.all(rows.map((r) => publishEnvironment(r.id)));
}

export function registerSegmentRoutes(app: FastifyInstance): void {
  app.get('/v1/projects/:projectId/segments', async (req) => {
    const { projectId } = projectParams.parse(req.params);
    await resolveProject(app.db, req.auth, projectId, 'viewer');
    return app.db
      .select()
      .from(segments)
      .where(eq(segments.projectId, projectId))
      .orderBy(asc(segments.key));
  });

  app.post('/v1/projects/:projectId/segments', async (req, reply) => {
    const { projectId } = projectParams.parse(req.params);
    const body = segmentCreateBody.parse(req.body);
    const scope = await resolveProject(app.db, req.auth, projectId, 'developer');

    const segment = await app.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(segments)
        .values({
          projectId,
          key: body.key,
          name: body.name,
          description: body.description ?? null,
          rules: body.rules,
        })
        .returning();
      if (!row) throw new Error('segment insert failed');
      await writeAudit(tx, {
        orgId: scope.orgId,
        actorId: req.auth.user.id,
        action: 'segment.create',
        entityType: 'segment',
        entityId: row.id,
        after: { key: row.key, name: row.name, rules: row.rules },
      });
      return row;
    });
    await publishProjectEnvironments(app, projectId);
    return reply.status(201).send(segment);
  });

  app.patch('/v1/segments/:segmentId', async (req) => {
    const { segmentId } = segmentParams.parse(req.params);
    const body = segmentPatchBody.parse(req.body);
    const scope = await resolveSegment(app.db, req.auth, segmentId, 'developer');

    const segment = await app.db.transaction(async (tx) => {
      const [before] = await tx.select().from(segments).where(eq(segments.id, segmentId));
      if (!before) throw notFound('segment');
      const [after] = await tx
        .update(segments)
        .set(body)
        .where(eq(segments.id, segmentId))
        .returning();
      await writeAudit(tx, {
        orgId: scope.orgId,
        actorId: req.auth.user.id,
        action: 'segment.update',
        entityType: 'segment',
        entityId: segmentId,
        before: { name: before.name, description: before.description, rules: before.rules },
        after: body,
      });
      return after;
    });
    await publishProjectEnvironments(app, scope.projectId);
    return segment;
  });

  app.delete('/v1/segments/:segmentId', async (req, reply) => {
    const { segmentId } = segmentParams.parse(req.params);
    const scope = await resolveSegment(app.db, req.auth, segmentId, 'developer');

    await app.db.transaction(async (tx) => {
      const [before] = await tx.select().from(segments).where(eq(segments.id, segmentId));
      if (!before) throw notFound('segment');
      await tx.delete(segments).where(eq(segments.id, segmentId));
      await writeAudit(tx, {
        orgId: scope.orgId,
        actorId: req.auth.user.id,
        action: 'segment.delete',
        entityType: 'segment',
        entityId: segmentId,
        before: { key: before.key, name: before.name },
      });
    });
    await publishProjectEnvironments(app, scope.projectId);
    return reply.status(204).send();
  });
}
