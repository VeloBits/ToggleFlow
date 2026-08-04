/**
 * Sorting for the flags list - pure, stable, non-mutating.
 *
 * Client-side, because `GET /v1/environments/:id/flags` has no sort parameter:
 * it hardcodes `orderBy(asc(tools.key))` and returns the whole environment. At
 * a couple of thousand rows the comparison cost is far below a frame; the
 * render is the expense, which is why the page windows rows rather than
 * virtualising them.
 *
 * Kept in its own module beside `flags-filter.ts` for the same reason that one
 * is: pure functions over row arrays are where the cheap branch coverage lives,
 * and the page above them stays a thin shell.
 */
import { flagStatus, STATUS_ORDER } from './FlagStatusBadge';

export type SortKey = 'key' | 'name' | 'type' | 'status' | 'updatedAt';
export type SortDirection = 'asc' | 'desc';

export interface FlagSort {
  key: SortKey;
  dir: SortDirection;
}

/** Matches the server's own ordering, so the first paint is not a re-sort. */
export const DEFAULT_SORT: FlagSort = { key: 'key', dir: 'asc' };

export interface SortableFlag {
  key: string;
  name: string;
  valueType: string;
  enabled: boolean;
  rolloutPercent: number | null;
  archived: boolean;
  updatedAt: string;
}

/**
 * Comparators return the ASCENDING order; `sortFlags` inverts for descending.
 *
 * Text uses `localeCompare` so `Ä` sorts next to `A` rather than after `Z`, and
 * `numeric: true` so `flag.step-2` precedes `flag.step-10` - flag keys are full
 * of numbers and codepoint order gets that visibly wrong.
 */
const COMPARATORS: Record<SortKey, (a: SortableFlag, b: SortableFlag) => number> = {
  key: (a, b) => a.key.localeCompare(b.key, undefined, { numeric: true, sensitivity: 'base' }),
  name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
  type: (a, b) => a.valueType.localeCompare(b.valueType),
  status: (a, b) => STATUS_ORDER[flagStatus(a)] - STATUS_ORDER[flagStatus(b)],
  // Lexicographic on an ISO-8601 UTC string is chronological, and avoids
  // constructing two Dates per comparison.
  updatedAt: (a, b) => a.updatedAt.localeCompare(b.updatedAt),
};

export function sortFlags<T extends SortableFlag>(rows: T[], sort: FlagSort): T[] {
  const compare = COMPARATORS[sort.key];
  const sign = sort.dir === 'asc' ? 1 : -1;
  /*
   * Key is the tiebreaker for every other column, which is what makes this
   * stable in the sense that matters: two flags updated in the same second, or
   * both off, keep a predictable order instead of shuffling between renders and
   * making the table look alive when nothing changed.
   */
  return [...rows].sort((a, b) => {
    const primary = compare(a, b);
    if (primary !== 0) return primary * sign;
    return sort.key === 'key' ? 0 : COMPARATORS.key(a, b);
  });
}

/** Cycle a column header: ascending, then descending, then back to ascending. */
export function nextSort(current: FlagSort, key: SortKey): FlagSort {
  if (current.key !== key) return { key, dir: 'asc' };
  return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
}
