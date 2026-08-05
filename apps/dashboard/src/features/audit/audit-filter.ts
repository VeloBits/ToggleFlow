/**
 * The audit log's filters, and the reason there are only three of them.
 *
 * Every axis here is evaluated **client-side, over the pages already loaded**,
 * because `GET /v1/orgs/:orgId/audit` accepts only `limit` and a `before`
 * cursor - there is no server-side filtering, and `audit_log` is indexed on
 * `(org_id, created_at)` alone, so adding one would be an unindexed scan.
 *
 * That constraint is also why there is deliberately **no date filter**. A date
 * range applied to the loaded window would answer "entries from last Tuesday
 * that happen to be in the 50 rows you have scrolled" - a subset presented as an
 * answer, which on an audit screen is a wrong answer. Narrowing by date needs a
 * server parameter first; until then the cursor is the honest instrument.
 *
 * The filters that ARE here are safe under partial loading because they are
 * predicates on individual rows: filtering to "Flags" tells you about the rows
 * you have, and the footer says how many that is out of how many are loaded.
 */
import type { AuditRow } from './audit-summary';
import { actionGroup } from './audit-events';

export interface AuditFilter {
  search: string;
  /** An `ACTION_GROUPS` id, or `all`. */
  group: string;
  /** A member's `userId`, `system` for entries with no actor, or `all`. */
  actor: string;
}

export const EMPTY_FILTER: AuditFilter = { search: '', group: 'all', actor: 'all' };

/** How many axes are away from their default - the badge on the Filters button. */
export function activeAuditFilterCount(filter: AuditFilter): number {
  let count = 0;
  if (filter.group !== EMPTY_FILTER.group) count += 1;
  if (filter.actor !== EMPTY_FILTER.actor) count += 1;
  return count;
}

export function matchesAuditFilter(row: AuditRow, filter: AuditFilter): boolean {
  if (filter.group !== 'all' && actionGroup(row.entry.action) !== filter.group) return false;

  if (filter.actor !== 'all') {
    const actorId = row.entry.actorId;
    if (filter.actor === 'system' ? actorId !== null : actorId !== filter.actor) return false;
  }

  const search = filter.search.trim().toLowerCase();
  // Every term must match, in any order and anywhere in the row - so
  // "ana checkout" finds Ana's edits to the checkout flag without the user
  // having to guess which column holds which.
  if (search !== '') {
    return search.split(/\s+/).every((term) => row.haystack.includes(term));
  }
  return true;
}
