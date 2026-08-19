/**
 * The Segments list.
 *
 * ## Scale
 *
 * `GET /v1/projects/:id/segments` returns the project's segments with no `limit`
 * or `search`, so filtering is a pure function over one fetch - the same
 * arrangement `FlagsPage` documents. Unlike flags there is no windowing here: a
 * project has flags in the hundreds and segments in the tens, because a segment is
 * a shared definition rather than a per-feature record. If that assumption ever
 * breaks, the fix is the one flags took (server-side paging), not virtualisation.
 *
 * ## Order of decisions
 *
 * The workspace is settled before the query is consulted, and that order is
 * load-bearing: `segmentsQueryOptions` is disabled without a project, and a
 * disabled react-query reports `isPending` forever - so checking the query first
 * is what leaves a project-less organization staring at a loading skeleton for a
 * request that was never going to be made.
 */
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { Segment } from '@/api/client';
import { segmentUsageQueryOptions, segmentsQueryOptions } from '@/api/segments';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/page';
import { ErrorNote } from '@/components/ui';
import { useWorkspace } from '@/state/WorkspaceContext';
import { PlusIcon, SearchIcon } from '@/ui/icons';

import { SegmentCreateDialog } from './SegmentCreateDialog';
import { SegmentsCards } from './SegmentsCards';
import { NoProjectState, NoSegmentMatchesState, NoSegmentsState } from './SegmentsEmptyState';
import { SegmentsSkeleton } from './SegmentsSkeleton';
import { SegmentsTable } from './SegmentsTable';
import { conditionText } from './segment-summary';

/**
 * Name, key, description and the conditions themselves.
 *
 * Searching the CONDITIONS is the one that earns its keep: "which segment targets
 * on `region`?" is the question someone asks before adding a fifth segment that
 * targets on region, and it cannot be answered from names alone.
 */
function matchesSearch(segment: Segment, needle: string): boolean {
  if (needle === '') return true;
  const haystack = [
    segment.name,
    segment.key,
    segment.description ?? '',
    ...segment.rules.flat().map(conditionText),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

export function SegmentsPage() {
  const ws = useWorkspace();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const segmentsQuery = useQuery(segmentsQueryOptions(ws.projectId));
  const usageQuery = useQuery(segmentUsageQueryOptions(ws.projectId));

  /*
   * Memoised rather than a bare `?? []`, which mints a fresh array on every render
   * and so would make the filter below re-run on each keystroke elsewhere on the
   * page - and, worse, hand `SegmentsTable`'s memoised rows a new array identity
   * every time. The empty-array fallback only exists for the pending state.
   */
  const rows = useMemo(() => segmentsQuery.data ?? [], [segmentsQuery.data]);
  const needle = search.trim().toLowerCase();
  const visible = useMemo(
    () => rows.filter((segment) => matchesSearch(segment, needle)),
    [rows, needle],
  );

  const canEdit = ws.role === 'admin' || ws.role === 'developer';

  /* Stable identity, because `SegmentsTableRow` is memoised against it. */
  const onOpen = useCallback((segment: Segment) => navigate(`/segments/${segment.id}`), [navigate]);

  const workspaceEmpty = ws.ready && !ws.loading && ws.projects.length === 0;
  if (workspaceEmpty) {
    return (
      <>
        <PageHeader title="Segments" description="Every segment belongs to a project." />
        <Card className="overflow-hidden p-0">
          <NoProjectState />
        </Card>
      </>
    );
  }

  const body = () => {
    if (segmentsQuery.isPending) return <SegmentsSkeleton />;
    if (rows.length === 0) {
      return <NoSegmentsState canEdit={canEdit} onCreate={() => setCreating(true)} />;
    }
    if (visible.length === 0) {
      return <NoSegmentMatchesState total={rows.length} onClear={() => setSearch('')} />;
    }
    return (
      <>
        <SegmentsTable segments={visible} usage={usageQuery.data} onOpen={onOpen} />
        <SegmentsCards segments={visible} usage={usageQuery.data} onOpen={onOpen} />
      </>
    );
  };

  return (
    <>
      <PageHeader
        title="Segments"
        description={
          segmentsQuery.isPending
            ? 'Loading…'
            : `Reusable targeting groups for ${ws.project?.name ?? 'this project'}`
        }
        actions={
          canEdit &&
          rows.length > 0 && (
            <Button onClick={() => setCreating(true)}>
              <PlusIcon size={14} /> Create segment
            </Button>
          )
        }
      />

      {rows.length > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <div className="relative w-full max-w-xs">
            <SearchIcon
              size={13}
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
            />
            <Input
              value={search}
              placeholder="Search name, key or condition…"
              aria-label="Search segments"
              className="pl-8 text-[12.5px]"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {needle !== '' && (
            <span className="text-muted-foreground text-[12px] tabular-nums">
              {visible.length} of {rows.length}
            </span>
          )}
        </div>
      )}

      {/* The usage query's failure is reported but never blocks the list: a
          missing count is a degraded column, not a broken page. */}
      <ErrorNote error={segmentsQuery.error ?? usageQuery.error} />
      <Card className="overflow-hidden p-0">{body()}</Card>

      {creating && <SegmentCreateDialog onClose={() => setCreating(false)} />}
    </>
  );
}
