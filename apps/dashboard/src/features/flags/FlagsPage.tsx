/**
 * The Flags list - the product's primary surface.
 *
 * ## Scale
 *
 * `GET /v1/environments/:id/flags` returns the whole environment with no
 * `limit`, `sort` or `search` parameter, so filtering and sorting are pure
 * functions over one fetch (`flags-filter.ts`, `flags-sort.ts`). At a couple of
 * thousand rows that arithmetic is far below a frame; the DOM is the cost, so
 * the page renders `PAGE_SIZE` rows at a time behind an explicit
 * "Show N more" and an exact count.
 *
 * Deliberately NOT virtualised. Windowing with a button solves the same problem
 * as `@tanstack/react-virtual` without adding a dependency whose untested
 * surface lands against a 92% coverage floor, and virtualisation is the wrong
 * next step anyway: the real fix is server-side paging
 * (`?limit=&offset=&sort=&search=`+`X-Total-Count`), after which these pure
 * functions become the fallback for small projects. That change is deferred
 * because it stops `['flags', envId]` being one cacheable list, which
 * `HomePage` and `SearchPage` both reuse - a page-set-wide refactor, not a
 * route tweak.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '@/api/client';
import { flagDefinitionsQueryOptions, flagsQueryOptions } from '@/api/flags';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, PageHeader } from '@/components/page';
import { ErrorNote } from '@/components/ui';
import { useWorkspace } from '@/state/WorkspaceContext';
import { FilterIcon, FlagIcon, PlusIcon } from '@/ui/icons';
import { useToast } from '@/ui/toast';

import { FlagFormDialog } from './FlagFormDialog';
import { FlagsCards } from './FlagsCards';
import { FlagsSkeleton } from './FlagsSkeleton';
import { FlagsTable } from './FlagsTable';
import { FlagsToolbar } from './FlagsToolbar';
import { EMPTY_FILTER, filterFlags, type FlagFilter } from './flags-filter';
import { DEFAULT_SORT, sortFlags, type FlagSort } from './flags-sort';
import type { CellContext, FlagRow } from './flag-columns';
import { useFlagPatch } from './use-flag-mutations';

const PAGE_SIZE = 100;

export function FlagsPage() {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<FlagFilter>(EMPTY_FILTER);
  const [sort, setSort] = useState<FlagSort>(DEFAULT_SORT);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<FlagRow | null>(null);

  const flagsQuery = useQuery({
    ...flagsQueryOptions(ws.environmentId),
    /*
     * 60s, down from the 15s this page used to poll at. At 15s the full
     * environment was fetched 240 times an hour whether anyone was looking or
     * not, and a poll landing mid-mutation is exactly the race `onMutate`'s
     * `cancelQueries` exists to stop. Focus-refetch covers the case that
     * actually matters: someone coming back to the tab wanting the truth.
     * Do not "restore" this to 15s.
     */
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  // Tags and descriptions live on the project-scoped definition, not on the
  // per-environment state the flags endpoint returns.
  const definitionsQuery = useQuery(flagDefinitionsQueryOptions(ws.projectId));

  const rows = useMemo(() => {
    const byId = new Map((definitionsQuery.data ?? []).map((d) => [d.id, d]));
    return (flagsQuery.data ?? []).map((row) => ({
      ...row,
      tags: byId.get(row.id)?.tags ?? [],
      description: byId.get(row.id)?.description ?? null,
    }));
  }, [flagsQuery.data, definitionsQuery.data]);

  const visible = useMemo(() => sortFlags(filterFlags(rows, filter), sort), [rows, filter, sort]);
  const page = useMemo(() => visible.slice(0, limit), [visible, limit]);
  const allTags = useMemo(
    () => [...new Set((definitionsQuery.data ?? []).flatMap((d) => d.tags))].sort(),
    [definitionsQuery.data],
  );

  const canEdit = ws.role === 'admin' || ws.role === 'developer';
  const patch = useFlagPatch(ws.environmentId);

  const ctx: CellContext = {
    canEdit,
    canDelete: ws.role === 'admin',
    // Production asks twice. Keyed off the environment key rather than a flag on
    // the environment record, the same test `FlagDetailPage` has always used.
    requireConfirm: ws.environment?.key === 'prod',
    onCommit: (flag, body) => patch.mutate({ flagId: flag.id, flagKey: flag.key, patch: body }),
    onCopyKey: (flag) => {
      void navigator.clipboard?.writeText(flag.key);
      toast(`Copied ${flag.key}`);
    },
    onEdit: (flag) => setEditing(flag),
    onArchive: async (flag, archived) => {
      try {
        await api.patch(`/v1/tools/${flag.id}`, { archived });
        toast(`${flag.key} ${archived ? 'archived' : 'restored'}`);
        await queryClient.invalidateQueries({ queryKey: ['flags'] });
        await queryClient.invalidateQueries({ queryKey: ['flag-definitions'] });
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Archive failed', { variant: 'error' });
      }
    },
    onDelete: async (flag) => {
      try {
        await api.delete(`/v1/tools/${flag.id}`);
        toast(`${flag.key} deleted`);
        await queryClient.invalidateQueries({ queryKey: ['flags'] });
        await queryClient.invalidateQueries({ queryKey: ['flag-definitions'] });
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Delete failed', { variant: 'error' });
      }
    },
    onOpen: (flag) => navigate(`/flags/${flag.id}`),
  };

  const body = () => {
    if (flagsQuery.isPending) return <FlagsSkeleton />;
    if (rows.length === 0) {
      return (
        <EmptyState
          icon={FlagIcon}
          title={`No flags in ${ws.project?.name ?? 'this project'} yet`}
          description="A flag is a switch your app reads at runtime — a kill switch, a staged rollout, or a value you want to change without a deploy."
          action={
            canEdit && (
              <Button onClick={() => setCreating(true)}>
                <PlusIcon size={14} /> Create your first flag
              </Button>
            )
          }
        />
      );
    }
    if (visible.length === 0) {
      // A different screen from "no flags", because the remedy is different:
      // one wants a flag created, the other wants a filter cleared.
      return (
        <EmptyState
          icon={FilterIcon}
          title="Nothing matches these filters"
          description={`${rows.length} ${rows.length === 1 ? 'flag' : 'flags'} in this environment, none of them matching.`}
          action={
            <Button variant="outline" onClick={() => setFilter(EMPTY_FILTER)}>
              Clear filters
            </Button>
          }
        />
      );
    }
    return (
      <>
        <FlagsTable flags={page} sort={sort} onSortChange={setSort} ctx={ctx} />
        <FlagsCards flags={page} ctx={ctx} />
        <Footer
          shown={page.length}
          total={visible.length}
          onMore={() => setLimit((l) => l + PAGE_SIZE)}
        />
      </>
    );
  };

  return (
    <>
      <PageHeader
        title="Flags"
        description={
          flagsQuery.isPending
            ? `Loading ${ws.environment?.name ?? ''}…`
            : `${visible.length} of ${rows.length} in ${ws.environment?.name ?? '…'}`
        }
        actions={
          canEdit &&
          rows.length > 0 && (
            <Button onClick={() => setCreating(true)}>
              <PlusIcon size={14} /> Create flag
            </Button>
          )
        }
      />
      <FlagsToolbar
        filter={filter}
        onChange={(next) => {
          setFilter(next);
          // A narrowed list should start at the top, not 300 rows in.
          setLimit(PAGE_SIZE);
        }}
        allTags={allTags}
        disabled={flagsQuery.isPending}
      />
      <ErrorNote error={flagsQuery.error} />
      <Card className="overflow-hidden p-0">{body()}</Card>

      {creating && ws.projectId && (
        <FlagFormDialog mode="create" projectId={ws.projectId} onClose={() => setCreating(false)} />
      )}
      {editing && ws.projectId && (
        <FlagFormDialog
          mode="edit"
          projectId={ws.projectId}
          flag={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function Footer({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  return (
    <div className="border-border text-muted-foreground flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-[12.5px]">
      {/* An exact count, not "many": a truncated list that does not say so reads
          as a complete one. */}
      <span className="tabular-nums">
        Showing {shown === total ? shown : `1–${shown}`} of {total}
      </span>
      {shown < total && (
        <Button variant="outline" size="sm" onClick={onMore}>
          Show {Math.min(PAGE_SIZE, total - shown)} more
        </Button>
      )}
    </div>
  );
}
