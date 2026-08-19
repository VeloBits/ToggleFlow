/**
 * "2 flags" / "Unused" - and the distinction between them is the point.
 *
 * `Unused` is styled as information rather than as a warning: an unused segment is
 * a normal thing to have just created, not a problem. What it enables is the
 * delete guard - the detail page can offer deletion without a second thought when
 * this says nothing depends on it.
 *
 * A `loading` state exists because the usage query is separate from the segment
 * list, so rows paint before the counts arrive. Rendering `0` in that window would
 * be a claim, and it is the exact claim someone acts on when deciding to delete.
 */
import type { SegmentUsage } from '@/api/client';
import { Skeleton } from '@/components/ui/skeleton';

export function SegmentUsageCell({
  usage,
  loading,
}: {
  usage: SegmentUsage | undefined;
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-4 w-14" />;

  const count = usage?.flagCount ?? 0;
  if (count === 0) {
    return <span className="text-muted-foreground text-[12px]">Unused</span>;
  }

  /*
   * Distinct environments rather than distinct flags, because the count is over
   * flag-state rows: one flag targeted in three environments is three rows. The
   * label says "flags" and the tooltip says where, which keeps the number small
   * and the detail available.
   */
  const environments = [...new Set((usage?.references ?? []).map((r) => r.environmentName))];

  return (
    <span className="text-text text-[12px]" title={`Referenced in ${environments.join(', ')}`}>
      {count} {count === 1 ? 'reference' : 'references'}
      {environments.length > 0 && (
        <span className="text-muted-foreground">
          {' '}
          · {environments.length === 1 ? environments[0] : `${environments.length} envs`}
        </span>
      )}
    </span>
  );
}
