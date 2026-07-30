/**
 * Org-scoped audit trail. Every mutation writes exactly one entry, inside
 * the same transaction as the mutation itself where one exists.
 */
import { auditLog } from '../db/schema';

/** Accepts a Db or a transaction - anything with drizzle's insert(). */
type Writable = {
  insert: (table: typeof auditLog) => { values: (v: AuditEntry) => Promise<unknown> };
};

export interface AuditEntry {
  orgId: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

export async function writeAudit(db: Writable, entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values(entry);
}
