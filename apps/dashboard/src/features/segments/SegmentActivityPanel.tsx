/**
 * This segment's history - the reference design's "Recent Activity" card.
 *
 * Real entries from the audit log, which already records `segment.create`,
 * `segment.update` and `segment.delete`. The one thing it needed was a server-side
 * `entityId` filter; see `auditEntityQueryOptions` for why filtering client-side
 * would have quietly shown an empty history.
 */
import { useQuery } from '@tanstack/react-query';

import type { AuditEntry } from '@/api/client';
import { actorLabel, auditEntityQueryOptions, membersQueryOptions } from '@/api/audit';
import { Panel } from '@/components/page';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkspace } from '@/state/WorkspaceContext';
import { relativeTime } from '@/ui/relative-time';

/** `segment.update` → `Updated`. The noun is the page you are on already. */
const ACTION_TEXT: Record<string, string> = {
  'segment.create': 'Created',
  'segment.update': 'Updated',
  'segment.delete': 'Deleted',
};

const actionText = (action: string) => ACTION_TEXT[action] ?? action;

export function SegmentActivityPanel({
  segmentId,
  limit = 6,
}: {
  segmentId: string;
  limit?: number;
}) {
  const ws = useWorkspace();
  const entriesQuery = useQuery(auditEntityQueryOptions(ws.orgId, segmentId, limit));
  const membersQuery = useQuery(membersQueryOptions(ws.orgId));

  return (
    <Panel title="Recent activity">
      <div className="p-3">
        {entriesQuery.isPending ? (
          <div className="flex flex-col gap-2" aria-hidden>
            {Array.from({ length: 3 }, (_, row) => (
              <Skeleton key={row} className="h-8 w-full" />
            ))}
          </div>
        ) : entriesQuery.isError ? (
          <p className="text-muted-foreground m-0 text-[12px]">History is unavailable right now.</p>
        ) : (entriesQuery.data ?? []).length === 0 ? (
          /*
           * Reachable in practice: the audit row's `entityId` is the segment's id,
           * so a segment that predates the entityId filter still has entries - but
           * one created before audit coverage, or by a path that did not write one,
           * has none. Saying so beats an empty box.
           */
          <p className="text-muted-foreground m-0 text-[12px]">No recorded changes yet.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {(entriesQuery.data ?? []).map((entry) => (
              <ActivityRow key={entry.id} entry={entry} members={membersQuery.data} />
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function ActivityRow({
  entry,
  members,
}: {
  entry: AuditEntry;
  members: Parameters<typeof actorLabel>[1];
}) {
  return (
    <li className="flex flex-col gap-0.5">
      <span className="text-text text-[12.5px]">
        {actionText(entry.action)}{' '}
        <span className="text-muted-foreground">by {actorLabel(entry.actorId, members)}</span>
      </span>
      <span className="text-muted-foreground text-[11px]">{relativeTime(entry.createdAt)}</span>
    </li>
  );
}
