import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireOrgRole, resolveEnvironment } from '../auth/rbac';
import { apiKeys, environments, projects } from '../db/schema';
import { generateApiKey } from '../lib/api-keys';
import { writeAudit } from '../lib/audit';
import { notFound } from '../lib/errors';

const environmentParams = z.object({ environmentId: z.uuid() });
const keyParams = z.object({ keyId: z.uuid() });

const keyCreateBody = z.object({
  name: z.string().min(1).max(200),
  kind: z.enum(['server', 'client']),
});

/** Public representation - the hash never leaves the database. */
const toPublic = (key: typeof apiKeys.$inferSelect) => ({
  id: key.id,
  environmentId: key.environmentId,
  kind: key.kind,
  name: key.name,
  prefix: key.prefix,
  createdAt: key.createdAt,
  revokedAt: key.revokedAt,
});

export function registerApiKeyRoutes(app: FastifyInstance): void {
  app.get('/v1/environments/:environmentId/keys', async (req) => {
    const { environmentId } = environmentParams.parse(req.params);
    await resolveEnvironment(app.db, req.auth, environmentId, 'admin');
    const rows = await app.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.environmentId, environmentId))
      .orderBy(asc(apiKeys.createdAt));
    return rows.map(toPublic);
  });

  /** Reveal-once: the response's `token` field is the only time the full key exists outside a hash. */
  app.post('/v1/environments/:environmentId/keys', async (req, reply) => {
    const { environmentId } = environmentParams.parse(req.params);
    const body = keyCreateBody.parse(req.body);
    const scope = await resolveEnvironment(app.db, req.auth, environmentId, 'admin');

    const generated = generateApiKey(body.kind);
    const key = await app.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(apiKeys)
        .values({
          environmentId,
          kind: body.kind,
          name: body.name,
          prefix: generated.prefix,
          keyHash: generated.hash,
          createdById: req.auth.user.id,
        })
        .returning();
      if (!row) throw new Error('api key insert failed');
      await writeAudit(tx, {
        orgId: scope.orgId,
        actorId: req.auth.user.id,
        action: 'api_key.create',
        entityType: 'api_key',
        entityId: row.id,
        after: { name: row.name, kind: row.kind, prefix: row.prefix },
      });
      return row;
    });
    app.publisher.scheduleKeys(environmentId);
    return reply.status(201).send({ ...toPublic(key), token: generated.token });
  });

  app.delete('/v1/api-keys/:keyId', async (req) => {
    const { keyId } = keyParams.parse(req.params);
    const [row] = await app.db
      .select({ key: apiKeys, orgId: projects.orgId })
      .from(apiKeys)
      .innerJoin(environments, eq(environments.id, apiKeys.environmentId))
      .innerJoin(projects, eq(projects.id, environments.projectId))
      .where(eq(apiKeys.id, keyId));
    if (!row || !req.auth.roles.has(row.orgId)) throw notFound('api key');
    requireOrgRole(req.auth, row.orgId, 'admin');

    if (row.key.revokedAt) return toPublic(row.key);

    const revoked = await app.db.transaction(async (tx) => {
      const [after] = await tx
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(eq(apiKeys.id, keyId))
        .returning();
      if (!after) throw notFound('api key');
      await writeAudit(tx, {
        orgId: row.orgId,
        actorId: req.auth.user.id,
        action: 'api_key.revoke',
        entityType: 'api_key',
        entityId: keyId,
        before: { name: after.name, kind: after.kind, prefix: after.prefix },
        after: { revokedAt: after.revokedAt?.toISOString() },
      });
      return after;
    });
    app.publisher.scheduleKeys(row.key.environmentId);
    return toPublic(revoked);
  });
}
