/**
 * The pieces of a single event's full record, shared by the two surfaces that
 * show it: the inline row expansion and the side panel.
 *
 * Shared deliberately. An audit viewer with two renderings of the same event is
 * a viewer where one of them is subtly stale, and "the row said X but the panel
 * said Y" is the one bug this screen can least afford.
 */
import type { ReactNode } from 'react';

import { cn } from '@/ui/cn';
import { relativeTime } from '@/ui/relative-time';

import { AuditChangeTable, AuditFactTable } from './AuditChangeList';
import { JsonViewer } from './JsonViewer';
import { contextFacts, type AuditRow } from './audit-summary';
import { entityLabel } from './audit-events';

/** A labelled value in the metadata block. */
function MetaItem({
  label,
  children,
  mono,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground m-0 text-[11px] font-semibold tracking-wide uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          'text-text m-0 mt-0.5 text-[12.5px] break-words',
          mono && 'font-mono text-[12px]',
        )}
      >
        {children}
      </dd>
    </div>
  );
}

/**
 * Who, when, and what the API called it.
 *
 * The raw `action` and `entityId` are shown rather than hidden behind the
 * friendly label. `entityId` in particular is the only handle on the two events
 * whose target cannot be resolved to a name at all - a flag state change and a
 * config save record the surrogate row id of a table no endpoint exposes - so
 * for those it is the difference between a correlatable record and a dead end.
 */
export function AuditMetaGrid({ row, className }: { row: AuditRow; className?: string }) {
  const { entry, summary } = row;
  const context = contextFacts(entry);

  return (
    <dl
      className={cn(
        'grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4',
        'm-0',
        className,
      )}
    >
      <MetaItem label="When">
        <span title={new Date(entry.createdAt).toLocaleString()}>
          {relativeTime(entry.createdAt)}
        </span>
      </MetaItem>
      <MetaItem label="Changed by">{row.actor}</MetaItem>
      <MetaItem label="Action" mono>
        {entry.action}
      </MetaItem>
      <MetaItem label="Entity">{entityLabel(entry.entityType)}</MetaItem>
      <MetaItem label={summary.target.label} mono={summary.target.mono}>
        {summary.target.name ?? <span className="text-muted-foreground">not recorded</span>}
      </MetaItem>
      {entry.entityId && (
        <MetaItem label="Entity ID" mono>
          {entry.entityId}
        </MetaItem>
      )}
      {context.map((fact) => (
        <MetaItem key={fact.field} label={fact.label} mono>
          {String(fact.value)}
        </MetaItem>
      ))}
    </dl>
  );
}

/** A titled block inside the detail body. */
export function DetailSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('min-w-0', className)}>
      <h3 className="text-muted-foreground mb-2 text-[11px] font-semibold tracking-wide uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** The change grid, the snapshot grid, or an honest note that there is neither. */
export function AuditChangesSection({ row }: { row: AuditRow }) {
  const { summary } = row;

  if (summary.facts.length > 0) {
    return (
      <DetailSection title={summary.meta.payload === 'removed' ? 'What was removed' : 'Recorded'}>
        <AuditFactTable facts={summary.facts} />
      </DetailSection>
    );
  }
  if (summary.changes.length > 0) {
    return (
      <DetailSection title="Changes">
        <AuditChangeTable changes={summary.changes} />
      </DetailSection>
    );
  }
  return (
    <DetailSection title="Changes">
      <p className="text-muted-foreground m-0 text-[12.5px]">
        {summary.hasPayload
          ? 'The payload recorded no field-level change.'
          : 'This event was recorded without a before or after payload.'}
      </p>
    </DetailSection>
  );
}

/**
 * Both payloads verbatim.
 *
 * `columns` is explicit rather than a `lg:` breakpoint because Tailwind's
 * breakpoints measure the *viewport*, and this component renders in two places
 * of very different widths: a full-width row expansion, where two columns let
 * the eye compare, and a ~576px side panel, where two columns would leave each
 * payload about twenty characters across. The panel is narrow on a wide monitor,
 * which is exactly the case a viewport query gets wrong.
 */
export function AuditRawSection({
  row,
  maxHeight,
  columns = 2,
}: {
  row: AuditRow;
  maxHeight?: string;
  columns?: 1 | 2;
}) {
  const { entry } = row;
  return (
    <div className={cn('grid min-w-0 grid-cols-1 gap-3', columns === 2 && 'lg:grid-cols-2')}>
      <DetailSection title="Before">
        <JsonViewer value={entry.before} label="the before payload" maxHeight={maxHeight} />
      </DetailSection>
      <DetailSection title="After">
        <JsonViewer value={entry.after} label="the after payload" maxHeight={maxHeight} />
      </DetailSection>
    </div>
  );
}
