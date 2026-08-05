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
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '@/api/client';
import { flagDefinitionsQueryOptions, flagKeys, flagsQueryOptions } from '@/api/flags';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/page';
import { ErrorNote } from '@/components/ui';
import { useWorkspace } from '@/state/WorkspaceContext';
import { FilterIcon, PlusIcon } from '@/ui/icons';
import { useToast } from '@/ui/toast';

import { FlagFormDialog } from './FlagFormDialog';
import { FlagsBulkBar } from './FlagsBulkBar';
import { FlagsCards } from './FlagsCards';
import {
  NoEnvironmentState,
  NoFlagsState,
  NoMatchesState,
  NoProjectState,
} from './FlagsEmptyState';
import { FlagsSkeleton } from './FlagsSkeleton';
import { FlagsTable } from './FlagsTable';
import { FlagsToolbar } from './FlagsToolbar';
import { EMPTY_FILTER, filterFlags, type FlagFilter } from './flags-filter';
import { useFlagSelection } from './flag-selection';
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
  /*
   * Destructured, not held as `patch`: react-query hands back a fresh result
   * object whenever the mutation's own state moves, so a `ctx` memo that depended
   * on it would re-identify on every toggle - which is the one moment the rows
   * around the toggled one must NOT all re-render. `mutate` itself is stable.
   */
  const { mutate: commitFlag } = useFlagPatch(ws.environmentId);

  /*
   * Selection is derived from the windowed page, not the filtered list, so the
   * header checkbox means the rows it sits above - see `flag-selection.ts`.
   */
  const selection = useFlagSelection(page);

  /*
   * A selection does not survive changing environment. `flag-selection.ts`'s
   * intersection cannot catch this one: a flag id is project-scoped, so the same
   * ids are on screen in every environment of the project and every tick would
   * carry over intact - a set chosen in Development, still armed in Production,
   * where the same gesture means something else entirely. The environment id is
   * also what a project switch moves, so it is the only thing worth watching.
   *
   * Reset during render, as `AuditLogPage` does: an effect would paint the stale
   * selection once first, and here that paint is a bulk bar reporting a count for
   * an environment nobody is looking at.
   */
  const [selectionEnv, setSelectionEnv] = useState(ws.environmentId);
  if (selectionEnv !== ws.environmentId) {
    setSelectionEnv(ws.environmentId);
    selection.clear();
  }

  /*
   * Refetch both halves of a row: the definition query owns `archived`, the list
   * query owns everything else, and archiving moves the flag in both.
   */
  const refetchBoth = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: flagKeys.listPrefix });
    await queryClient.invalidateQueries({ queryKey: flagKeys.definitionsPrefix });
  }, [queryClient]);

  const onArchive = useCallback(
    async (flag: FlagRow, archived: boolean) => {
      try {
        await api.patch(`/v1/tools/${flag.id}`, { archived });
        toast(`${flag.key} ${archived ? 'archived' : 'restored'}`);
        await refetchBoth();
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Archive failed', { variant: 'error' });
      }
    },
    [refetchBoth, toast],
  );

  const onDelete = useCallback(
    async (flag: FlagRow) => {
      try {
        await api.delete(`/v1/tools/${flag.id}`);
        toast(`${flag.key} deleted`);
        await refetchBoth();
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Delete failed', { variant: 'error' });
      }
    },
    [refetchBoth, toast],
  );

  /*
   * Memoised, and that is load-bearing rather than hygiene: `FlagsTable`'s rows
   * are `memo`ised against this object, so a fresh literal per render would make
   * that memo dead code and re-render every one of a hundred rows on each
   * keystroke in the search box - each of them formatting a timestamp and
   * mounting a switch, a tooltip and a Radix menu. `useFlagSelection` keeps its
   * own identity for the same reason (see its docblock); `toast`, `navigate`,
   * `patch.mutate` and the setters are already stable.
   */
  const ctx: CellContext = useMemo(
    () => ({
      canEdit,
      canDelete: ws.role === 'admin',
      // Production asks twice. Keyed off the environment key rather than a flag on
      // the environment record, the same test `FlagDetailPage` has always used.
      requireConfirm: ws.environment?.key === 'prod',
      /*
       * Only for the roles that can run a bulk action, which is what stops a viewer
       * seeing a column of checkboxes for buttons they will never get. Absent leaves
       * the table and the cards exactly as they were.
       */
      selection: canEdit ? selection : undefined,
      onCommit: (flag, body) => commitFlag({ flagId: flag.id, flagKey: flag.key, patch: body }),
      onCopyKey: (flag) => {
        void navigator.clipboard?.writeText(flag.key);
        toast(`Copied ${flag.key}`);
      },
      onEdit: (flag) => setEditing(flag),
      onArchive,
      onDelete,
      onOpen: (flag) => navigate(`/flags/${flag.id}`),
    }),
    [
      canEdit,
      navigate,
      onArchive,
      onDelete,
      commitFlag,
      selection,
      toast,
      ws.environment?.key,
      ws.role,
    ],
  );

  /*
   * The workspace is decided before the query is consulted, and that order is
   * load-bearing: `flagsQueryOptions` is disabled without an environment, and a
   * disabled react-query reports `isPending` forever - so checking the query
   * first is what used to leave a project-less organization staring at the
   * table's loading skeleton for a request that was never going to be made.
   */
  const workspaceEmpty = ws.ready && !ws.loading && ws.projects.length === 0;
  const environmentMissing =
    ws.ready && !ws.loading && ws.projectId !== null && ws.environmentId === null;

  if (workspaceEmpty || environmentMissing) {
    return (
      <>
        <PageHeader
          title="Flags"
          description={
            workspaceEmpty
              ? 'Every flag belongs to a project.'
              : `Nothing to show until ${ws.project?.name ?? 'this project'} has an environment.`
          }
        />
        <Card className="overflow-hidden p-0">
          {workspaceEmpty ? <NoProjectState /> : <NoEnvironmentState />}
        </Card>
      </>
    );
  }

  const body = () => {
    if (flagsQuery.isPending) return <FlagsSkeleton />;
    if (rows.length === 0) {
      return <NoFlagsState canEdit={canEdit} onCreate={() => setCreating(true)} />;
    }
    if (visible.length === 0) {
      return (
        <NoMatchesState
          icon={FilterIcon}
          total={rows.length}
          onClear={() => setFilter(EMPTY_FILTER)}
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
      {/* Above the list and outside the Card, deliberately - see FlagsBulkBar. */}
      {selection.count > 0 && <FlagsBulkBar selection={selection} rows={page} />}
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
