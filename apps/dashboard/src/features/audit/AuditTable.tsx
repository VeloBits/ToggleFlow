/**
 * The log as a table, with a disclosure per row.
 *
 * ## Two ways in, on purpose
 *
 * The chevron expands the row in place; the trailing button opens the side
 * panel. They are not redundant. Expanding keeps your position in a long list
 * and lets two rows be open at once for comparison; the panel gives the raw
 * payload the width and the tabs it needs. Both are real `<button>`s, so the
 * whole feature is reachable by keyboard - the row's own `onClick` is a mouse
 * convenience layered on top of that, never the only route.
 *
 * ## Why rows are memoised
 *
 * Typing in the search box re-derives the filtered list on every keystroke. With
 * `AuditTableRow` memoised, a keystroke re-renders only the rows that entered or
 * left the result set; without it, every visible row re-renders per character,
 * and each one formats its own payload. That is the difference between a
 * responsive filter at 50 rows and a janky one at 500.
 */
import { memo } from 'react';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/ui/cn';
import { ChevronDownIcon, ChevronRightIcon, PanelLeftIcon } from '@/ui/icons';
import { relativeTime } from '@/ui/relative-time';

import { AuditActionBadge } from './AuditActionBadge';
import { AuditPayloadSummary } from './AuditChangeList';
import { AuditChangesSection, AuditMetaGrid, AuditRawSection } from './AuditEventDetail';
import type { AuditRow } from './audit-summary';

/**
 * The columns, as one list.
 *
 * Shared with `AuditSkeleton` so the placeholder cannot drift from the real
 * header - the loading state jumping sideways when data lands is exactly the
 * kind of thing two hand-maintained copies of a column list produce. Not the
 * full cell-rendering registry `features/flags/flag-columns.tsx` uses: this table
 * has no sorting and no card parity to drive, so the widths and headings are all
 * that need to agree.
 */
export interface AuditColumn {
  key: string;
  /** null for the two icon columns, which carry an `srHeading` instead. */
  heading: string | null;
  srHeading?: string;
  width: string;
  /** Placeholder bar width, so the skeleton matches the real content's shape. */
  skeleton: string;
  lgOnly?: boolean;
}

export const AUDIT_COLUMNS: AuditColumn[] = [
  { key: 'expand', heading: null, srHeading: 'Expand', width: 'w-8', skeleton: 'w-4' },
  { key: 'when', heading: 'When', width: 'w-32', skeleton: 'w-20' },
  { key: 'event', heading: 'Event', width: 'w-36', skeleton: 'w-24' },
  { key: 'target', heading: 'Target', width: 'w-48', skeleton: 'w-28', lgOnly: true },
  { key: 'details', heading: 'Details', width: '', skeleton: 'w-56' },
  { key: 'actor', heading: 'Changed by', width: 'w-36', skeleton: 'w-24' },
  { key: 'open', heading: null, srHeading: 'Open', width: 'w-10', skeleton: 'w-4' },
];

const COLUMN_COUNT = AUDIT_COLUMNS.length;

/**
 * The header, tinted and in small caps.
 *
 * Matches what the legacy `table.data th` rule did in CSS and what the flags
 * table does through its sort buttons - shadcn's bare `TableHead` is
 * `text-foreground font-medium`, which on a dense log is nearly as loud as the
 * data underneath it.
 */
export function AuditTableHead() {
  return (
    <TableHeader className="bg-bg2">
      <TableRow className="hover:bg-transparent">
        {AUDIT_COLUMNS.map((column) => (
          <TableHead
            key={column.key}
            className={cn(
              'text-muted-foreground h-9 text-[11.5px] font-semibold tracking-[0.03em] uppercase',
              column.width,
              column.lgOnly && 'hidden lg:table-cell',
            )}
          >
            {column.heading ?? <span className="sr-only">{column.srHeading}</span>}
          </TableHead>
        ))}
      </TableRow>
    </TableHeader>
  );
}

function AuditTableRowBase({
  row,
  expanded,
  onToggle,
  onOpen,
}: {
  row: AuditRow;
  expanded: boolean;
  onToggle: (id: string) => void;
  onOpen: (row: AuditRow) => void;
}) {
  const { entry, summary } = row;
  const detailId = `audit-detail-${entry.id}`;
  const what = `${summary.meta.subject} ${summary.meta.verb}${
    summary.target.name ? ` — ${summary.target.name}` : ''
  }`;

  return (
    <>
      <TableRow
        // align-middle now that every cell is a single line except Details,
        // which centres against the rest rather than hanging off the top.
        className="cursor-pointer [&>td]:py-2.5"
        onClick={() => onOpen(row)}
        data-testid="audit-row"
      >
        {/* stopPropagation: the chevron expands in place, it does not also open the panel. */}
        <TableCell className="w-8 pr-0" onClick={(event) => event.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-expanded={expanded}
            aria-controls={detailId}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} details for ${what}`}
            onClick={() => onToggle(entry.id)}
          >
            {expanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
          </Button>
        </TableCell>

        <TableCell className="text-muted-foreground w-32 text-[12.5px] whitespace-nowrap tabular-nums">
          <span title={new Date(entry.createdAt).toLocaleString()}>
            {relativeTime(entry.createdAt)}
          </span>
        </TableCell>

        <TableCell className="w-36">
          <AuditActionBadge meta={summary.meta} action={entry.action} />
        </TableCell>

        {/*
          One line, not two. The entity noun earns its place because it varies
          row to row - "Flag" and "Flag state" are different things - but stacked
          above the name it doubled the height of all fifty rows.
        */}
        <TableCell className="hidden w-48 lg:table-cell">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="text-muted-foreground shrink-0 text-[10.5px] tracking-wide uppercase">
              {summary.target.label}
            </span>
            {summary.target.name ? (
              <span
                className={cn(
                  'text-text min-w-0 truncate text-[12.5px]',
                  summary.target.mono && 'font-mono text-[12px]',
                )}
                title={summary.target.name}
              >
                {summary.target.name}
              </span>
            ) : (
              <span className="text-muted-foreground text-[12.5px]">—</span>
            )}
          </span>
        </TableCell>

        <TableCell className="min-w-0">
          <AuditPayloadSummary summary={summary} />
        </TableCell>

        <TableCell className="w-36">
          <span className="block truncate text-[12.5px]" title={row.actor}>
            {row.actor}
          </span>
        </TableCell>

        <TableCell className="w-10 text-right" onClick={(event) => event.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Open full details for ${what}`}
            onClick={() => onOpen(row)}
          >
            <PanelLeftIcon size={14} />
          </Button>
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow id={detailId} className="hover:bg-transparent">
          <TableCell colSpan={COLUMN_COUNT} className="bg-bg2/60 p-0">
            {/*
              The left accent ties the panel to the row it belongs to. Without it
              an expansion between two rows is ambiguous about which one opened
              it - and it lands under the chevron that did.
            */}
            <div className="border-l-primary/50 flex min-w-0 flex-col gap-4 border-l-2 px-4 py-4">
              <AuditMetaGrid row={row} />
              <AuditChangesSection row={row} />
              <AuditRawSection row={row} maxHeight="max-h-64" />
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

const AuditTableRow = memo(AuditTableRowBase);

export function AuditTable({
  rows,
  expandedIds,
  onToggle,
  onOpen,
}: {
  rows: AuditRow[];
  expandedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onOpen: (row: AuditRow) => void;
}) {
  return (
    <div className="hidden md:block">
      <Table aria-label="Audit log">
        <AuditTableHead />
        <TableBody>
          {rows.map((row) => (
            <AuditTableRow
              key={row.entry.id}
              row={row}
              expanded={expandedIds.has(row.entry.id)}
              onToggle={onToggle}
              onOpen={onOpen}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
