/**
 * Org creation. Reading orgs is `/v1/me` (memberships come off the auth
 * context), so this file is only the write path.
 *
 * Every user already gets one org bootstrapped on first login
 * (auth/context.ts). This endpoint is the explicit second-and-beyond case: a
 * consultancy separating clients, a company splitting staging estates. There
 * is no permission check because there is nothing to check against - creating
 * an org creates the very membership that would authorize it, exactly like
 * signup. The creator is always its admin.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { orgMemberships, orgs } from '../db/schema';
import { writeAudit } from '../lib/audit';

const orgBody = z.object({ name: z.string().trim().min(1).max(200) });

export function registerOrgRoutes(app: FastifyInstance): void {
  app.post('/v1/orgs', async (req, reply) => {
    const body = orgBody.parse(req.body);

    const org = await app.db.transaction(async (tx) => {
      const [row] = await tx.insert(orgs).values({ name: body.name }).returning();
      if (!row) throw new Error('org insert failed');
      await tx
        .insert(orgMemberships)
        .values({ orgId: row.id, userId: req.auth.user.id, role: 'admin' });
      await writeAudit(tx, {
        orgId: row.id,
        actorId: req.auth.user.id,
        action: 'org.create',
        entityType: 'org',
        entityId: row.id,
        after: { name: row.name },
      });
      return row;
    });

    // The membership was written after this request's auth context was built,
    // so `req.auth.roles` is already stale. Patch it rather than leave a
    // half-truth behind for anything later in the request lifecycle.
    req.auth.roles.set(org.id, 'admin');
    return reply.status(201).send({ id: org.id, name: org.name, role: 'admin' as const });
  });
}
