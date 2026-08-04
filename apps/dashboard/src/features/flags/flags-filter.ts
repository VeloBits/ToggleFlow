/** Pure client-side filtering for the flags list - fast at 254+ rows. */
import type { FlagValueType } from '@toggleflow/engine';

import type { Flag } from '../../api/client';

export interface FlagFilter {
  search: string;
  tag: string;
  /**
   * `on` means serving to everyone, `rollout` means serving to a percentage.
   * The two are distinct because "enabled" alone hides the difference between a
   * flag that is live and one that is live for 5% of users.
   */
  status: 'all' | 'on' | 'off' | 'rollout';
  valueType: 'all' | FlagValueType;
  includeArchived: boolean;
}

export const EMPTY_FILTER: FlagFilter = {
  search: '',
  tag: '',
  status: 'all',
  valueType: 'all',
  includeArchived: false,
};

/**
 * Narrows a flag list to what the filter admits.
 *
 * Generic over the row rather than taking `Flag` exactly, because the list page
 * joins fields from the definition query (tags today, description next) onto
 * each row and needs them back out with their types intact. Both are optional
 * here: a caller that has not joined them is not punished with a cast, it just
 * gets no matches on the axis it did not supply.
 */
export function filterFlags<T extends Flag & { tags?: string[]; description?: string | null }>(
  flags: T[],
  filter: FlagFilter,
): T[] {
  const needle = filter.search.trim().toLowerCase();
  return flags.filter((flag) => {
    if (!filter.includeArchived && flag.archived) return false;
    if (
      needle &&
      !flag.key.toLowerCase().includes(needle) &&
      !flag.name.toLowerCase().includes(needle) &&
      !(flag.description ?? '').toLowerCase().includes(needle)
    ) {
      return false;
    }
    if (filter.tag && !(flag.tags ?? []).includes(filter.tag)) return false;
    if (filter.status === 'on' && !(flag.enabled && flag.rolloutPercent === null)) return false;
    if (filter.status === 'off' && flag.enabled) return false;
    if (filter.status === 'rollout' && !(flag.enabled && flag.rolloutPercent !== null))
      return false;
    if (filter.valueType !== 'all' && flag.valueType !== filter.valueType) return false;
    return true;
  });
}
