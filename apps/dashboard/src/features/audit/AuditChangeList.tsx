/**
 * The readable rendering of a payload: `Enabled  ON → OFF`, not `{"enabled":…}`.
 *
 * Two presentations of the same data, because a table cell and a detail panel
 * want opposite things. The cell wants one scannable line and a truthful count
 * of what it left out; the panel wants a labelled grid with nothing elided. They
 * share `ValueChip` so a value never formats one way in the row and another way
 * in the panel - which was the specific confusion the old truncated-JSON cell
 * created.
 */
import { cn } from '@/ui/cn';
import { ArrowRightIcon } from '@/ui/icons';

import { formatFieldValue, type AuditChange, type AuditFact } from './audit-summary';

const TONE_CLASS = {
  on: 'bg-on-soft text-on',
  off: 'bg-off-soft text-off',
  neutral: 'bg-bg2 text-text',
} as const;

/**
 * A single value.
 *
 * `max-w-[22ch]` + `truncate` rather than a JS-side substring, so the full text
 * stays in the DOM for the `title`, for Ctrl+F and for a screen reader. A value
 * clipped by CSS is still *there*; a value clipped by `slice()` is gone.
 */
export function ValueChip({
  field,
  value,
  className,
}: {
  field: string;
  value: unknown;
  className?: string;
}) {
  const formatted = formatFieldValue(field, value);
  return (
    <span
      title={formatted.absent ? undefined : formatted.text}
      className={cn(
        'inline-block max-w-[22ch] truncate rounded-sm px-1.5 align-bottom text-[12px] tabular-nums',
        formatted.absent ? 'text-muted-foreground' : TONE_CLASS[formatted.tone],
        formatted.mono && 'font-mono text-[11.5px]',
        className,
      )}
    >
      {formatted.text}
    </span>
  );
}

/**
 * `label  before → after`, or `label  value` when there was no previous value.
 *
 * The arrow is only drawn for a genuine transition. A flag's first-ever edit has
 * `before: null` for the whole row, and "— → ON" invites the reader to wonder
 * what the dash meant; "ON" simply states what was set.
 */
function ChangeLine({ change, className }: { change: AuditChange; className?: string }) {
  return (
    <span className={cn('inline-flex items-baseline gap-1.5 whitespace-nowrap', className)}>
      <span className="text-muted-foreground text-[12px]">{change.label}</span>
      {change.kind === 'added' ? (
        <ValueChip field={change.field} value={change.after} />
      ) : (
        <>
          <ValueChip
            field={change.field}
            value={change.before}
            className={change.kind === 'removed' ? 'line-through' : undefined}
          />
          <ArrowRightIcon size={11} className="text-muted-foreground shrink-0 self-center" />
          <ValueChip field={change.field} value={change.after} />
        </>
      )}
    </span>
  );
}

/** The compact, one-line form for a table cell. */
export function AuditChangeSummary({
  changes,
  limit = 2,
  className,
}: {
  changes: AuditChange[];
  limit?: number;
  className?: string;
}) {
  const shown = changes.slice(0, limit);
  const hidden = changes.length - shown.length;

  return (
    <span className={cn('flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1', className)}>
      {shown.map((change) => (
        <ChangeLine key={change.field} change={change} />
      ))}
      {hidden > 0 && (
        <span className="text-muted-foreground text-[12px] tabular-nums">
          +{hidden} more {hidden === 1 ? 'field' : 'fields'}
        </span>
      )}
    </span>
  );
}

/** The compact form for a snapshot rather than a diff (a creation or a deletion). */
export function AuditFactSummary({
  facts,
  limit = 2,
  className,
}: {
  facts: AuditFact[];
  limit?: number;
  className?: string;
}) {
  const shown = facts.slice(0, limit);
  const hidden = facts.length - shown.length;

  return (
    <span className={cn('flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1', className)}>
      {shown.map((fact) => (
        <span key={fact.field} className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="text-muted-foreground text-[12px]">{fact.label}</span>
          <ValueChip field={fact.field} value={fact.value} />
        </span>
      ))}
      {hidden > 0 && (
        <span className="text-muted-foreground text-[12px] tabular-nums">
          +{hidden} more {hidden === 1 ? 'field' : 'fields'}
        </span>
      )}
    </span>
  );
}

/**
 * The compact payload rendering for a row, whichever shape the payload is.
 *
 * The old cell fell back to printing the entity type when there was no payload,
 * which put the word "flag_state" where a change should be and read as though
 * that *were* the change. Saying nothing was recorded is shorter and true.
 */
export function AuditPayloadSummary({
  summary,
  limit,
  className,
}: {
  summary: { changes: AuditChange[]; facts: AuditFact[]; hasPayload: boolean };
  limit?: number;
  className?: string;
}) {
  if (summary.facts.length > 0) {
    return <AuditFactSummary facts={summary.facts} limit={limit} className={className} />;
  }
  if (summary.changes.length > 0) {
    return <AuditChangeSummary changes={summary.changes} limit={limit} className={className} />;
  }
  return (
    <span className={cn('text-muted-foreground text-[12px] italic', className)}>
      {summary.hasPayload ? 'No fields changed' : 'No details recorded'}
    </span>
  );
}

/**
 * The full, unelided grid for the detail panel.
 *
 * A `<dl>`-shaped 3-column grid rather than a `<table>`: this is a set of
 * name/value pairs about one thing, not a table of comparable rows, and the
 * `Before`/`After` headings are column labels for the eye rather than real
 * headers a screen reader should announce per cell. Values wrap here - the panel
 * is the surface where nothing is allowed to be unreachable.
 */
export function AuditChangeTable({ changes }: { changes: AuditChange[] }) {
  return (
    <div className="border-border overflow-hidden rounded-md border">
      <div
        aria-hidden
        className="border-border text-muted-foreground bg-bg2 grid grid-cols-[minmax(6rem,1fr)_minmax(0,1.4fr)_minmax(0,1.4fr)] gap-3 border-b px-3 py-1.5 text-[11px] font-semibold tracking-wide uppercase"
      >
        <span>Field</span>
        <span>Before</span>
        <span>After</span>
      </div>
      <dl className="m-0">
        {changes.map((change) => (
          <div
            key={change.field}
            className="border-border grid grid-cols-[minmax(6rem,1fr)_minmax(0,1.4fr)_minmax(0,1.4fr)] items-baseline gap-3 border-b px-3 py-2 last:border-b-0"
          >
            <dt className="text-text m-0 text-[12.5px] font-medium break-words">{change.label}</dt>
            <dd className="m-0 min-w-0">
              {change.kind === 'added' ? (
                <span className="text-muted-foreground text-[12px]">not set</span>
              ) : (
                <ValueChip
                  field={change.field}
                  value={change.before}
                  className="max-w-full whitespace-normal"
                />
              )}
            </dd>
            <dd className="m-0 min-w-0">
              {change.kind === 'removed' ? (
                <span className="text-muted-foreground text-[12px]">removed</span>
              ) : (
                <ValueChip
                  field={change.field}
                  value={change.after}
                  className="max-w-full whitespace-normal"
                />
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The full snapshot grid for the detail panel. */
export function AuditFactTable({ facts }: { facts: AuditFact[] }) {
  return (
    <dl className="border-border m-0 overflow-hidden rounded-md border">
      {facts.map((fact) => (
        <div
          key={fact.field}
          className="border-border grid grid-cols-[minmax(6rem,1fr)_minmax(0,2fr)] items-baseline gap-3 border-b px-3 py-2 last:border-b-0"
        >
          <dt className="text-text m-0 text-[12.5px] font-medium break-words">{fact.label}</dt>
          <dd className="m-0 min-w-0">
            <ValueChip
              field={fact.field}
              value={fact.value}
              className="max-w-full whitespace-normal"
            />
          </dd>
        </div>
      ))}
    </dl>
  );
}
