/**
 * The narrow-viewport rendering of the log.
 *
 * A list rather than a horizontally-scrolling table, and rendered alongside
 * `AuditTable` with CSS choosing between them at `md` - the same approach
 * `FlagsTable`/`FlagsCards` take, and for the same reason: a `matchMedia` hook
 * makes the choice at runtime, which means it is wrong for one paint on load and
 * untestable under happy-dom, where `matchMedia` does not exist.
 *
 * Consequence worth knowing when writing tests: every row is in the DOM twice.
 * Scope list assertions to one layout (`getByRole('table')` or
 * `getByRole('list', { name: 'Audit log (compact)' })`).
 *
 * There is no inline expansion here. On a phone an expanded row with two JSON
 * payloads in it is longer than the viewport, so the card opens the panel
 * directly - which on that breakpoint is full-width and is the better reading
 * surface anyway.
 */
import { memo } from 'react';

import { cn } from '@/ui/cn';
import { relativeTime } from '@/ui/relative-time';

import { AuditActionBadge } from './AuditActionBadge';
import { AuditPayloadSummary } from './AuditChangeList';
import type { AuditRow } from './audit-summary';

function AuditCardBase({ row, onOpen }: { row: AuditRow; onOpen: (row: AuditRow) => void }) {
  const { entry, summary } = row;
  const what = `${summary.meta.subject} ${summary.meta.verb}${
    summary.target.name ? ` — ${summary.target.name}` : ''
  }`;

  return (
    <li className="border-border border-b last:border-b-0">
      <button
        type="button"
        aria-label={`Open full details for ${what}`}
        onClick={() => onOpen(row)}
        className="hover:bg-highlight flex w-full flex-col items-start gap-2 border-0 bg-transparent px-4 py-3 text-left"
      >
        <span className="flex w-full flex-wrap items-center gap-2">
          <AuditActionBadge meta={summary.meta} action={entry.action} />
          <span className="text-text min-w-0 flex-1 truncate text-[13px] font-medium">
            {summary.meta.subject} {summary.meta.verb}
          </span>
          <span
            className="text-muted-foreground shrink-0 text-[12px] tabular-nums"
            title={new Date(entry.createdAt).toLocaleString()}
          >
            {relativeTime(entry.createdAt)}
          </span>
        </span>

        {summary.target.name && (
          <span className="text-muted-foreground flex w-full min-w-0 items-baseline gap-1.5 text-[12px]">
            <span className="shrink-0 tracking-wide uppercase">{summary.target.label}</span>
            <span className={cn('text-text min-w-0 truncate', summary.target.mono && 'font-mono')}>
              {summary.target.name}
            </span>
          </span>
        )}

        <AuditPayloadSummary summary={summary} limit={2} className="w-full" />

        <span className="text-muted-foreground text-[12px]">{row.actor}</span>
      </button>
    </li>
  );
}

const AuditCard = memo(AuditCardBase);

export function AuditCards({
  rows,
  onOpen,
}: {
  rows: AuditRow[];
  onOpen: (row: AuditRow) => void;
}) {
  return (
    <ul aria-label="Audit log (compact)" className="m-0 list-none p-0 md:hidden">
      {rows.map((row) => (
        <AuditCard key={row.entry.id} row={row} onOpen={onOpen} />
      ))}
    </ul>
  );
}
