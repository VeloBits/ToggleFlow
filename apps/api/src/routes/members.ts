/**
 * Org member management (backs the dashboard's members page). Members must
 * already have a ToggleFlow account (first Keycloak sign-in provisions it) —
 * adding is by email lookup, not invitation. The org must always keep at
 * least one admin.
 */
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireOrgRole } from '../auth/rbac';
import { orgMemberships, users } from '../db/schema';
import { writeAudit } from '../lib/audit';
import { HttpError, notFound } from '../lib/errors';

const orgParams = z.object({ orgId: z.uuid() });
const memberParams = z.object({ orgId: z.uuid(), userId: z.uuid() });
const roleSchema = z.enum(['admin', 'developer', 'viewer']);
const addBody = z.object({ email: z.email(), role: roleSchema });
const patchBody = z.object({ role: roleSchema });

const lastAdmin = () => new HttpError(400, 'last_admin', 'an org must keep at least one admin');

async function adminCount(db: FastifyInstance['db'], orgId: string): Promise<number> {
  const rows = await db
    .select({ userId: orgMemberships.userId })
    .from(orgMemberships)
    .where(and(eq(orgMemberships.orgId, orgId), eq(orgMemberships.role, 'admin')));
  return rows.length;
}

export function registerMemberRoutes(app: FastifyInstance): void {
  app.get('/v1/orgs/:orgId/members', async (req) => {
    const { orgId } = orgParams.parse(req.params);
    requireOrgRole(req.auth, orgId, 'viewer');
    return app.db
      .select({
        userId: orgMemberships.userId,
        email: users.email,
        displayName: users.displayName,
        role: orgMemberships.role,
        createdAt: orgMemberships.createdAt,
      })
      .from(orgMemberships)
      .innerJoin(users, eq(users.id, orgMemberships.userId))
      .where(eq(orgMemberships.orgId, orgId))
      .orderBy(asc(orgMemberships.createdAt));
  });

  app.post('/v1/orgs/:orgId/members', async (req, reply) => {
    const { orgId } = orgParams.parse(req.params);
    const body = addBody.parse(req.body);
    requireOrgRole(req.auth, orgId, 'admin');

    const [user] = await app.db.select().from(users).where(eq(users.email, body.email));
    if (!user) {
      throw new HttpError(
        404,
        'user_not_found',
        'no ToggleFlow account with that email — they must sign in once first',
      );
    }
    const member = await app.db.transaction(async (tx) => {
      await tx.insert(orgMemberships).values({ orgId, userId: user.id, role: body.role });
      await writeAudit(tx, {
        orgId,
        actorId: req.auth.user.id,
        action: 'member.add',
        entityType: 'org_membership',
        entityId: user.id,
        after: { email: user.email, role: body.role },
      });
      return { userId: user.id, email: user.email, displayName: user.displayName, role: body.role };
    });
    return reply.status(201).send(member);
  });

  app.patch('/v1/orgs/:orgId/members/:userId', async (req) => {
    const { orgId, userId } = memberParams.parse(req.params);
    const body = patchBody.parse(req.body);
    requireOrgRole(req.auth, orgId, 'admin');

    return app.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(orgMemberships)
        .where(and(eq(orgMemberships.orgId, orgId), eq(orgMemberships.userId, userId)));
      if (!current) throw notFound('member');
      if (
        current.role === 'admin' &&
        body.role !== 'admin' &&
        (await adminCount(app.db, orgId)) <= 1
      ) {
        throw lastAdmin();
      }
      await tx
        .update(orgMemberships)
        .set({ role: body.role })
        .where(and(eq(orgMemberships.orgId, orgId), eq(orgMemberships.userId, userId)));
      await writeAudit(tx, {
        orgId,
        actorId: req.auth.user.id,
        action: 'member.update',
        entityType: 'org_membership',
        entityId: userId,
        before: { role: current.role },
        after: { role: body.role },
      });
      return { userId, role: body.role };
    });
  });

  app.delete('/v1/orgs/:orgId/members/:userId', async (req, reply) => {
    const { orgId, userId } = memberParams.parse(req.params);
    requireOrgRole(req.auth, orgId, 'admin');

    await app.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(orgMemberships)
        .where(and(eq(orgMemberships.orgId, orgId), eq(orgMemberships.userId, userId)));
      if (!current) throw notFound('member');
      if (current.role === 'admin' && (await adminCount(app.db, orgId)) <= 1) {
        throw lastAdmin();
      }
      await tx
        .delete(orgMemberships)
        .where(and(eq(orgMemberships.orgId, orgId), eq(orgMemberships.userId, userId)));
      await writeAudit(tx, {
        orgId,
        actorId: req.auth.user.id,
        action: 'member.remove',
        entityType: 'org_membership',
        entityId: userId,
        before: { role: current.role },
      });
    });
    return reply.status(204).send();
  });
}
