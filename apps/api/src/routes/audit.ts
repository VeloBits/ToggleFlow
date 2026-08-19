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
  /**
   * Narrow to one entity's history, for the activity panels on detail pages.
   *
   * Server-side rather than a client filter over the org-wide feed: the feed is
   * paged newest-first, so in a busy org an entity's events sit far past the
   * first page and filtering what arrived would show an empty history for a
   * segment that has plenty. No `entityType` companion - these are uuids, so an
   * id already identifies the row without one.
   */
  entityId: z.uuid().optional(),
});

export function registerAuditRoutes(app: FastifyInstance): void {
  app.get('/v1/orgs/:orgId/audit', async (req) => {
    const { orgId } = orgParams.parse(req.params);
    const query = auditQuery.parse(req.query);
    requireOrgRole(req.auth, orgId, 'viewer');

    const conditions = [eq(auditLog.orgId, orgId)];
    if (query.before) conditions.push(lt(auditLog.createdAt, new Date(query.before)));
    if (query.entityId) conditions.push(eq(auditLog.entityId, query.entityId));

    const entries = await app.db
      .select()
      .from(auditLog)
      .where(and(...conditions))
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(query.limit);
    return { entries };
  });
}
