/**
 * "3 minutes ago", via Intl rather than a date library.
 *
 * Shared because two surfaces need the same phrasing for the same timestamps -
 * the audit feed on the overview and the Updated column on the flags table - and
 * two implementations of "how long ago" drift into disagreeing about the same
 * instant.
 */

/**
 * Each step divides into the next, so the loop lands on the largest unit the gap
 * fills. `Intl.RelativeTimeFormat` has no "pick a unit for me" mode; this is
 * that missing step.
 */
const DIVISIONS: [limit: number, unit: Intl.RelativeTimeFormatUnit][] = [
  [60, 'second'],
  [60, 'minute'],
  [24, 'hour'],
  [7, 'day'],
  [4.34524, 'week'],
  [12, 'month'],
];

/** Beyond a year it stops being "ago" to anybody and prints a date. */
export function relativeTime(iso: string): string {
  const date = new Date(iso);
  // Negative: these are always timestamps in the past.
  let value = (date.getTime() - Date.now()) / 1000;
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [limit, unit] of DIVISIONS) {
    if (Math.abs(value) < limit) return format.format(Math.round(value), unit);
    value /= limit;
  }
  return date.toLocaleDateString();
}
