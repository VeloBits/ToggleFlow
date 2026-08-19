/**
 * The below-`md` list. Same fields as `SegmentsTable`, stacked - see that file for
 * why both are always mounted rather than chosen by a hook.
 */
import type { Segment, SegmentUsage } from '@/api/client';
import { relativeTime } from '@/ui/relative-time';

import { SegmentUsageCell } from './SegmentUsageCell';
import { rulesSummary, structureLabel } from './segment-summary';

export function SegmentsCards({
  segments,
  usage,
  onOpen,
}: {
  segments: Segment[];
  usage: Record<string, SegmentUsage> | undefined;
  onOpen: (segment: Segment) => void;
}) {
  return (
    /*
     * Named, because both this and `SegmentsTable` are mounted on every paint and
     * CSS picks one - so a test (and a screen reader walking the whole tree) sees
     * every row twice. The name is what lets either one be addressed on purpose.
     */
    <ul aria-label="Segments (compact)" className="m-0 flex list-none flex-col p-0 md:hidden">
      {segments.map((segment) => {
        const summary = rulesSummary(segment.rules, segment.match);
        return (
          <li key={segment.id} className="border-border border-b last:border-b-0">
            {/*
              A button rather than a div with onClick: the row is the only target
              on a phone, so it has to be reachable by keyboard and announced as
              activatable. `text-left` undoes the centring a button brings.
            */}
            <button
              type="button"
              className="hover:bg-bg2 flex w-full flex-col gap-1 border-0 bg-transparent px-4 py-3 text-left"
              onClick={() => onOpen(segment)}
            >
              <span className="flex w-full items-baseline justify-between gap-2">
                <span className="text-text truncate text-[13px] font-medium">{segment.name}</span>
                <span className="text-muted-foreground shrink-0 text-[11px]">
                  {relativeTime(segment.updatedAt)}
                </span>
              </span>
              <span className="text-muted-foreground truncate font-mono text-[11.5px]">
                {segment.key}
              </span>
              <span className="text-text text-[12.5px]">
                {summary.text}
                {summary.hiddenCount > 0 && (
                  <span className="text-muted-foreground"> +{summary.hiddenCount} more</span>
                )}
              </span>
              <span className="flex items-center gap-2 text-[11px]">
                <span className="text-muted-foreground">
                  {structureLabel(segment.rules, segment.match)}
                </span>
                <SegmentUsageCell usage={usage?.[segment.key]} loading={usage === undefined} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
