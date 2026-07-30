/** Pure client-side filtering for the tools list - fast at 254+ rows. */
import type { FlagRow } from '../api/client';

export interface ToolFilter {
  search: string;
  tag: string;
  status: 'all' | 'on' | 'off' | 'rollout';
  includeArchived: boolean;
}

export const EMPTY_FILTER: ToolFilter = {
  search: '',
  tag: '',
  status: 'all',
  includeArchived: false,
};

export function filterRows<T extends FlagRow & { tags?: string[] }>(
  rows: T[],
  filter: ToolFilter,
): T[] {
  const needle = filter.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (!filter.includeArchived && row.archived) return false;
    if (
      needle &&
      !row.toolKey.toLowerCase().includes(needle) &&
      !row.toolName.toLowerCase().includes(needle)
    ) {
      return false;
    }
    if (filter.tag && !(row.tags ?? []).includes(filter.tag)) return false;
    if (filter.status === 'on' && !(row.enabled && row.rolloutPercent === null)) return false;
    if (filter.status === 'off' && row.enabled) return false;
    if (filter.status === 'rollout' && !(row.enabled && row.rolloutPercent !== null)) return false;
    return true;
  });
}
