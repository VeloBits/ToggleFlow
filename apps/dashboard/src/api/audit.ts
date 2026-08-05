/**
 * The query layer for the audit trail - the same job `api/flags.ts` does for
 * flags: one place that knows which URL answers a question and what its cache
 * key is.
 *
 * Two surfaces read this endpoint with different appetites (the overview's
 * eight-row feed and the full log's paged list), and they used to declare their
 * own `queryKey`, their own URL and their own copy of `actorLabel`. Three copies
 * of "who did this" is three chances to disagree about the same actor, which on
 * an audit screen is not a cosmetic bug.
 */
import { queryOptions } from '@tanstack/react-query';

import { api, type AuditEntry, type Member } from './client';

/**
 * How many entries a page asks for.
 *
 * The server accepts 1-200 and defaults to 50 (`apps/api/src/routes/audit.ts`).
 * The number is exported because pagination depends on the *identity* between
 * what was requested and what came back: a short page means there is nothing
 * older, and that inference breaks silently if the two drift apart.
 */
export const AUDIT_PAGE_SIZE = 50;

export const auditKeys = {
  /** Every page of every org, for an invalidation that can have changed any of them. */
  prefix: ['audit'] as const,
  page: (orgId: string | null, before: string | null) => ['audit', orgId, before] as const,
  /** The overview's short feed. A separate entry because it asks for a different limit. */
  recent: (orgId: string | null) => ['audit', orgId, 'home'] as const,
  members: (orgId: string | null) => ['members', orgId] as const,
};

/**
 * One page of the org's audit log, newest first.
 *
 * `before` is a cursor, not an offset: the server returns entries strictly older
 * than that ISO timestamp, ordered `createdAt desc, id desc`. Cursors survive
 * new entries arriving mid-read, which an offset does not - and on this screen
 * entries arrive constantly.
 */
export const auditPageQueryOptions = (orgId: string | null, before: string | null) =>
  queryOptions({
    queryKey: auditKeys.page(orgId, before),
    queryFn: () => {
      const cursor = before ? `&before=${encodeURIComponent(before)}` : '';
      return api
        .get<{ entries: AuditEntry[] }>(`/v1/orgs/${orgId}/audit?limit=${AUDIT_PAGE_SIZE}${cursor}`)
        .then((res) => res.entries);
    },
    enabled: orgId !== null,
  });

/** The newest few entries, for the overview's activity feed. */
export const auditRecentQueryOptions = (orgId: string | null, limit = 8) =>
  queryOptions({
    queryKey: auditKeys.recent(orgId),
    queryFn: () =>
      api
        .get<{ entries: AuditEntry[] }>(`/v1/orgs/${orgId}/audit?limit=${limit}`)
        .then((res) => res.entries),
    enabled: orgId !== null,
  });

/**
 * The org's current members - the only list that maps an actor id to a name,
 * because the audit endpoint returns `actorId` and nothing else.
 */
export const membersQueryOptions = (orgId: string | null) =>
  queryOptions({
    queryKey: auditKeys.members(orgId),
    queryFn: () => api.get<Member[]>(`/v1/orgs/${orgId}/members`),
    enabled: orgId !== null,
  });

/**
 * An actor id as a human label: display name, then email, then a short id.
 *
 * The short-id fallback is not a defect to be tidied away - it is what someone
 * who has since *left* the org looks like, because `/members` lists current
 * membership only. Their entries must still attribute to somebody, and eight
 * hex characters is enough to tell two departed colleagues apart.
 *
 * A null `actorId` means the user row itself is gone (the column is
 * `ON DELETE SET NULL`), which the log reports as the system.
 */
export function actorLabel(actorId: string | null, members: Member[] | undefined): string {
  if (!actorId) return 'system';
  const member = members?.find((m) => m.userId === actorId);
  return member?.displayName ?? member?.email ?? actorId.slice(0, 8);
}
