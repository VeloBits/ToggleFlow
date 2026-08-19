/**
 * The md-and-up segment list. `SegmentsCards` renders the same fields stacked and
 * Tailwind picks one at the `md` breakpoint - the arrangement `FlagsTable` uses,
 * and chosen over a `useMediaQuery` hook for the reason given there: a hook makes
 * the render path depend on happy-dom's `matchMedia`, so only one branch would
 * ever be exercised by the suite.
 *
 * The columns follow the reference design, minus MEMBER COUNT and STATUS. A
 * segment has no members to count (see `SegmentPreview`) and no status field, so
 * both columns could only have been filled with something invented. USAGE took
 * their place and answers the question people actually bring to this table:
 * is anything relying on this?
 */
import { memo } from 'react';

import type { Segment, SegmentUsage } from '@/api/client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/ui/cn';
import { relativeTime } from '@/ui/relative-time';

import { SegmentUsageCell } from './SegmentUsageCell';
import { rulesSummary, structureLabel } from './segment-summary';

const HEAD_CLASS = 'text-muted-foreground text-[11px] font-semibold uppercase tracking-wide';

export function SegmentsTable({
  segments,
  usage,
  onOpen,
}: {
  segments: Segment[];
  usage: Record<string, SegmentUsage> | undefined;
  onOpen: (segment: Segment) => void;
}) {
  return (
    <div className="hidden md:block">
      <Table aria-label="Segments">
        <TableHeader className="bg-bg2">
          <TableRow className="hover:bg-transparent">
            <TableHead className={HEAD_CLASS}>Name</TableHead>
            <TableHead className={HEAD_CLASS}>Key</TableHead>
            <TableHead className={cn(HEAD_CLASS, 'hidden lg:table-cell')}>Conditions</TableHead>
            <TableHead className={HEAD_CLASS}>Usage</TableHead>
            <TableHead className={cn(HEAD_CLASS, 'hidden xl:table-cell')}>Last modified</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {segments.map((segment) => (
            <SegmentsTableRow
              key={segment.id}
              segment={segment}
              usage={usage?.[segment.key]}
              // `usage` undefined = still loading; a zero would be a claim we
              // cannot make yet, and "0 flags" is exactly the answer that decides
              // whether someone deletes this.
              usageLoading={usage === undefined}
              onOpen={onOpen}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SegmentsTableRowBase({
  segment,
  usage,
  usageLoading,
  onOpen,
}: {
  segment: Segment;
  usage: SegmentUsage | undefined;
  usageLoading: boolean;
  onOpen: (segment: Segment) => void;
}) {
  const summary = rulesSummary(segment.rules, segment.match);

  return (
    <TableRow className="cursor-pointer" onClick={() => onOpen(segment)}>
      <TableCell className="py-2.5">
        <span className="text-text block truncate text-[13px] font-medium">{segment.name}</span>
        {segment.description && (
          <span className="text-muted-foreground block truncate text-[12px]">
            {segment.description}
          </span>
        )}
      </TableCell>
      <TableCell className="py-2.5">
        <span className="text-muted-foreground font-mono text-[12px]">{segment.key}</span>
      </TableCell>
      <TableCell className="hidden py-2.5 lg:table-cell">
        <span className="text-text block truncate text-[12.5px]">
          {summary.text}
          {summary.hiddenCount > 0 && (
            <span className="text-muted-foreground"> +{summary.hiddenCount} more</span>
          )}
        </span>
        <span className="text-muted-foreground text-[11px]">
          {structureLabel(segment.rules, segment.match)}
        </span>
      </TableCell>
      <TableCell className="py-2.5">
        <SegmentUsageCell usage={usage} loading={usageLoading} />
      </TableCell>
      <TableCell className="text-muted-foreground hidden py-2.5 text-[12px] xl:table-cell">
        {relativeTime(segment.updatedAt)}
      </TableCell>
    </TableRow>
  );
}

/**
 * Memoised for the reason `FlagsTableRow` is: the toolbar filters on every
 * keystroke, and each row formats a timestamp and summarises its rules. The
 * comparison only bites while `onOpen` and `usage` keep their identity between
 * renders, which is `SegmentsPage`'s job - this file's job is not to be the
 * reason it fails.
 */
const SegmentsTableRow = memo(SegmentsTableRowBase);
