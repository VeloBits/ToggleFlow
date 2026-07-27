import { and, desc, eq, lt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireOrgRole } from '../auth/rbac';
import { auditLog } from '../db/schema';

const orgParams = z.object({ orgId: z.uuid() });
const auditQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  /** Cursor: return entries strictly older than this ISO timestamp. */
  before: z.iso.datetime({ offset: true }).optional(),
});

export function registerAuditRoutes(app: FastifyInstance): void {
  app.get('/v1/orgs/:orgId/audit', async (req) => {
    const { orgId } = orgParams.parse(req.params);
    const query = auditQuery.parse(req.query);
    requireOrgRole(req.auth, orgId, 'viewer');

    const conditions = [eq(auditLog.orgId, orgId)];
    if (query.before) conditions.push(lt(auditLog.createdAt, new Date(query.before)));

    const entries = await app.db
      .select()
      .from(auditLog)
      .where(and(...conditions))
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(query.limit);
    return { entries };
  });
}
