/**
 * The query layer for segments and the attribute vocabulary they target on -
 * the same arrangement `api/flags.ts` has, and for the same reason: three
 * screens read the segment list, and a cache key that drifts on one of them is a
 * stale row nobody notices.
 *
 * ## Why usage is one project-wide request
 *
 * `GET /v1/projects/:id/segments/usage` answers for every segment at once. The
 * list needs a count per row and the detail page needs the references for one,
 * so a per-segment endpoint would make the list fan out N requests to render one
 * column. One response, one cache entry, both screens.
 */
import { queryOptions } from '@tanstack/react-query';

import { api, type ProjectAttribute, type Segment, type SegmentUsage } from './client';

export const segmentKeys = {
  /** Every project's list, for a mutation that could have touched any of them. */
  listPrefix: ['segments'] as const,
  list: (projectId: string | null) => ['segments', projectId] as const,
  usagePrefix: ['segment-usage'] as const,
  usage: (projectId: string | null) => ['segment-usage', projectId] as const,
  attributes: (projectId: string | null) => ['project-attributes', projectId] as const,
};

/**
 * The project's segments, ordered by key server-side.
 *
 * `projectId` is nullable because the workspace has no project until `/v1/me`
 * and the project list have both answered; `enabled` keeps the query from firing
 * until then. A DISABLED react-query reports `isPending` forever, so callers must
 * decide whether a workspace exists before consulting this query's state - the
 * bug that left the Flags page showing a skeleton for a request never made.
 */
export const segmentsQueryOptions = (projectId: string | null) =>
  queryOptions({
    queryKey: segmentKeys.list(projectId),
    queryFn: () => api.get<Segment[]>(`/v1/projects/${projectId}/segments`),
    enabled: projectId !== null,
  });

/** Which flags reference which segment key, keyed by KEY rather than id. */
export const segmentUsageQueryOptions = (projectId: string | null) =>
  queryOptions({
    queryKey: segmentKeys.usage(projectId),
    queryFn: () =>
      api.get<Record<string, SegmentUsage>>(`/v1/projects/${projectId}/segments/usage`),
    enabled: projectId !== null,
  });

/**
 * Attribute names and value samples derived from the project's existing rules.
 *
 * Cached longer than the lists it sits beside: it changes only when someone
 * writes a rule, it is read on every keystroke-free render of the builder, and a
 * suggestion list that lags by a minute costs nothing - the field accepts free
 * text regardless.
 */
export const projectAttributesQueryOptions = (projectId: string | null) =>
  queryOptions({
    queryKey: segmentKeys.attributes(projectId),
    queryFn: () => api.get<ProjectAttribute[]>(`/v1/projects/${projectId}/attributes`),
    enabled: projectId !== null,
    staleTime: 60_000,
  });
