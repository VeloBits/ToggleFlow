/**
 * Segment writes, and the cache invalidation each one implies.
 *
 * ## Why every mutation invalidates usage too
 *
 * Editing a segment cannot change which flags reference it - that lives on the
 * flag - but DELETING one can turn a live reference into a dangling one, and
 * creating one can resolve a dangling reference a flag was already carrying (a
 * targeting rule may name a segment key that does not exist yet; the engine
 * treats it as never matching). So the usage map is stale after a create or a
 * delete, and invalidating on all three costs one request on the rarer path
 * rather than leaving a wrong count on screen.
 *
 * Not optimistic. A flag toggle is optimistic because it is one boolean and the
 * gesture must feel instant; a segment save is a form submission whose result is
 * a whole rule tree, and guessing at the server's response would mean rendering
 * rules that may not have been accepted. The dialog and the detail page both keep
 * their pending state visible instead.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, type Segment } from '@/api/client';
import { auditKeys } from '@/api/audit';
import { segmentKeys } from '@/api/segments';
import { useWorkspace } from '@/state/WorkspaceContext';
import { useToast } from '@/ui/toast';

export interface SegmentWriteBody {
  name?: string;
  description?: string | null;
  rules?: unknown[][];
  match?: 'all' | 'any';
}

export interface SegmentCreateBody extends SegmentWriteBody {
  key: string;
  name: string;
}

/**
 * Both halves of the segment cache, the usage map, and the audit feed.
 *
 * The audit invalidation is not housekeeping: every segment write lands a row in
 * `audit_log`, and the detail page shows that history in a panel right beside the
 * Save button. Without this, saving a segment left "No recorded changes yet."
 * on screen next to the change that had just been recorded - which on an audit
 * surface reads as the trail not working.
 *
 * The whole `['audit']` prefix rather than this entity's key alone, because the
 * org-wide feed on the overview and the Audit log page are stale for the same
 * reason and by the same write.
 */
export function useInvalidateSegments() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: segmentKeys.listPrefix });
    await queryClient.invalidateQueries({ queryKey: segmentKeys.usagePrefix });
    await queryClient.invalidateQueries({ queryKey: auditKeys.prefix });
  };
}

export function useCreateSegment() {
  const ws = useWorkspace();
  const toast = useToast();
  const invalidate = useInvalidateSegments();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: SegmentCreateBody) =>
      api.post<Segment>(`/v1/projects/${ws.projectId}/segments`, body),
    onSuccess: async (segment) => {
      await invalidate();
      // The attribute vocabulary just grew by whatever this segment targets on,
      // and the builder's suggestions are the next thing anyone will look at.
      await queryClient.invalidateQueries({ queryKey: segmentKeys.attributes(ws.projectId) });
      toast(`${segment.key} created`);
    },
  });
}

export function useUpdateSegment(segmentId: string) {
  const ws = useWorkspace();
  const toast = useToast();
  const invalidate = useInvalidateSegments();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: SegmentWriteBody) => api.patch<Segment>(`/v1/segments/${segmentId}`, body),
    onSuccess: async (segment) => {
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: segmentKeys.attributes(ws.projectId) });
      toast(`${segment.key} saved`);
    },
  });
}

export function useDeleteSegment() {
  const toast = useToast();
  const invalidate = useInvalidateSegments();

  return useMutation({
    mutationFn: (segment: Segment) => api.delete(`/v1/segments/${segment.id}`),
    onSuccess: async (_result, segment) => {
      await invalidate();
      toast(`${segment.key} deleted`);
    },
  });
}
