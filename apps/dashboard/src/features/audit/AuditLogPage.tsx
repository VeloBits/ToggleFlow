/**
 * The audit log.
 *
 * ## What resolves a name, and what cannot
 *
 * Most entries name their own target: the API records `before.key` or
 * `after.name` in the payload, which is both cheaper and more correct than a
 * lookup, because it is the name the thing had *at the time*. The three that
 * record only an id are covered by data the workspace already holds - projects
 * and environments from `WorkspaceContext`, actors from the member list this
 * page fetches anyway - so the readable rendering costs no extra request.
 *
 * The exceptions are `flag.update` and `config.*`, whose `entityId` is the
 * surrogate row id of a `flag_states` / `tool_configs` row that no endpoint
 * exposes. Their target renders as the bare entity noun. That is a gap in what
 * the API records, not something to paper over here: `writeAudit` has the
 * environment and the flag in scope at both call sites and records neither.
 *
 * ## Paging
 *
 * Cursor, not offset - `before` is the `createdAt` of the oldest row on screen.
 * Earlier pages are kept in state and stay visible, so "Load older" grows the
 * list rather than replacing it, and a full page is the only signal that there
 * is more to fetch.
 */
import { useQuery } from '@tanstack/react-query';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';

import {
  AUDIT_PAGE_SIZE,
  actorLabel,
  auditPageQueryOptions,
  membersQueryOptions,
} from '@/api/audit';
import type { AuditEntry } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, PageHeader } from '@/components/page';
import { ErrorNote } from '@/components/ui';
import { FilterIcon, HistoryIcon } from '@/ui/icons';
import { useWorkspace } from '@/state/WorkspaceContext';

import { AuditCards } from './AuditCards';
import { AuditDetailPanel } from './AuditDetailPanel';
import { AuditSkeleton } from './AuditSkeleton';
import { AuditTable } from './AuditTable';
import { AuditToolbar } from './AuditToolbar';
import { EMPTY_FILTER, matchesAuditFilter, type AuditFilter } from './audit-filter';
import { buildAuditRow, type AuditLookup, type AuditRow } from './audit-summary';

/** Accumulated pages, tied to the org they were fetched for. */
interface Paging {
  orgId: string | null;
  before: string | null;
  pages: AuditEntry[][];
}

export function AuditLogPage() {
  const ws = useWorkspace();
  const [paging, setPaging] = useState<Paging>({ orgId: ws.orgId, before: null, pages: [] });
  const [filter, setFilter] = useState<AuditFilter>(EMPTY_FILTER);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [openRow, setOpenRow] = useState<AuditRow | null>(null);

  /*
   * Switching org must not leave the previous org's pages on screen. Resetting
   * during render rather than in an effect is React's own answer to
   * state-derived-from-props: it re-renders immediately with the new state and
   * never commits the stale list, where an effect would paint it once first.
   */
  if (paging.orgId !== ws.orgId) {
    setPaging({ orgId: ws.orgId, before: null, pages: [] });
    setExpandedIds(new Set());
    setOpenRow(null);
  }

  const auditQuery = useQuery(auditPageQueryOptions(ws.orgId, paging.before));
  const membersQuery = useQuery(membersQueryOptions(ws.orgId));

  const entries = useMemo(
    () => [...paging.pages.flat(), ...(auditQuery.data ?? [])],
    [paging.pages, auditQuery.data],
  );

  /*
   * Resolvers over data already in the cache. Built as lookup maps rather than
   * `Array.find` per row because the log is 50 rows deep and growing, and a
   * find-per-row is the quiet O(n·m) that turns "Load older" into a stutter.
   */
  const lookup = useMemo<AuditLookup>(() => {
    const projects = new Map(ws.projects.map((p) => [p.id, p.name]));
    const environments = new Map(ws.environments.map((e) => [e.id, e.name]));
    const members = new Map(
      (membersQuery.data ?? []).map((m) => [m.userId, m.displayName ?? m.email]),
    );
    return {
      project: (id) => projects.get(id) ?? null,
      environment: (id) => environments.get(id) ?? null,
      actor: (id) => members.get(id) ?? null,
    };
  }, [ws.projects, ws.environments, membersQuery.data]);

  const rows = useMemo(
    () =>
      entries.map((entry) =>
        buildAuditRow(entry, lookup, actorLabel(entry.actorId, membersQuery.data)),
      ),
    [entries, lookup, membersQuery.data],
  );

  /*
   * Deferred so a keystroke paints the new input value immediately and the
   * re-filter lands on the next tick. At 50 rows this is imperceptible either
   * way; at several hundred, after a few "Load older", it is the difference
   * between a laggy field and a responsive one.
   */
  const deferredFilter = useDeferredValue(filter);
  const visible = useMemo(
    () => rows.filter((row) => matchesAuditFilter(row, deferredFilter)),
    [rows, deferredFilter],
  );

  /** Only the actors actually present, so the select cannot produce an empty result. */
  const actors = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) seen.set(row.entry.actorId ?? 'system', row.actor);
    return [...seen]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const toggle = useCallback((id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const lastEntry = auditQuery.data?.at(-1);
  const hasOlder = lastEntry !== undefined && auditQuery.data?.length === AUDIT_PAGE_SIZE;

  /*
   * Advancing the cursor changes the query key, so `auditQuery.data` is
   * undefined until the next page answers - which would make `hasOlder` false
   * and unmount the button mid-click. Tracking the in-flight fetch separately
   * keeps it on screen, disabled, instead of having it blink out and back.
   */
  const loadingOlder = paging.before !== null && auditQuery.isPending;

  const loadOlder = () => {
    setPaging((current) => ({
      orgId: current.orgId,
      before: lastEntry!.createdAt,
      pages: [...current.pages, auditQuery.data ?? []],
    }));
  };

  const body = () => {
    // Only the very first page shows a skeleton. A later page arriving must not
    // blank the entries already being read.
    if (auditQuery.isPending && entries.length === 0) return <AuditSkeleton />;

    if (entries.length === 0) {
      return (
        <EmptyState
          icon={HistoryIcon}
          title="No activity yet"
          description="Every change anyone makes in this organization is recorded here — who did it, what changed, and when."
        />
      );
    }

    if (visible.length === 0) {
      return (
        <EmptyState
          icon={FilterIcon}
          title="Nothing matches these filters"
          description={`${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} loaded, none of them matching.`}
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
        <AuditTable
          rows={visible}
          expandedIds={expandedIds}
          onToggle={toggle}
          onOpen={setOpenRow}
        />
        <AuditCards rows={visible} onOpen={setOpenRow} />
        <div className="border-border text-muted-foreground flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-[12.5px]">
          {/*
            "loaded", not "of N": the server does not report a total, and this
            list is a window onto a table that is still being written to. A
            number presented as the total would be a number that is wrong.
          */}
          <span className="tabular-nums">
            {visible.length === entries.length
              ? `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} loaded`
              : `${visible.length} of ${entries.length} loaded entries`}
          </span>
          {(hasOlder || loadingOlder) && (
            <Button variant="outline" size="sm" disabled={loadingOlder} onClick={loadOlder}>
              {loadingOlder ? 'Loading…' : 'Load older'}
            </Button>
          )}
        </div>
      </>
    );
  };

  return (
    <>
      <PageHeader
        title="Audit log"
        description={
          ws.org ? `Every change in ${ws.org.name}, newest first` : 'Every change, newest first'
        }
      />
      <AuditToolbar
        filter={filter}
        onChange={setFilter}
        actors={actors}
        disabled={auditQuery.isPending && entries.length === 0}
      />
      <ErrorNote error={auditQuery.error} />
      <Card className="overflow-hidden p-0">{body()}</Card>
      {openRow && <AuditDetailPanel row={openRow} onClose={() => setOpenRow(null)} />}
    </>
  );
}
