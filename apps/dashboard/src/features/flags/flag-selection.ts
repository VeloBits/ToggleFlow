/**
 * Row selection for the flags list - the state half of bulk operations.
 *
 * ## Why the selection is derived, not stored
 *
 * The hook keeps the raw set of ids the user has clicked, and every reader gets
 * that set *intersected with the rows currently on screen*. Filtering, sorting,
 * paging and deletion therefore cannot leave a bulk action pointed at something
 * invisible: "Disable 12 flags" always means the twelve you can see and count.
 *
 * The alternative - pruning the set in an effect whenever the row list changes -
 * has a window between the filter narrowing and the effect running in which the
 * bulk bar shows a stale count and a click acts on rows that are gone. Deriving
 * closes the window rather than making it small, the same reasoning
 * `AuditLogPage` uses when it resets its paging during render.
 *
 * The raw set is deliberately NOT pruned, so a row that scrolls back into the
 * result set (the filter is cleared, "Show N more" is pressed) returns still
 * ticked. Selection survives a look elsewhere; it does not survive being told
 * the row no longer exists, because the intersection drops it the moment the
 * server stops sending it.
 *
 * ## Identity tracks content
 *
 * Deriving per render would hand back a fresh object every time, and
 * `FlagsPage` puts this object on the `ctx` that `FlagsTable`'s memoised rows
 * compare - so a hook that re-identified on every keystroke would silently make
 * that memo dead code and re-render a hundred rows per character. The returned
 * object therefore keeps its identity until the selection actually changes,
 * which costs one `useMemo`, one ref and a set comparison over a list this
 * already walks.
 */
import { useCallback, useMemo, useRef, useState } from 'react';

/** Shared, so the overwhelmingly common "nothing selected" case never re-identifies. */
const EMPTY: ReadonlySet<string> = new Set<string>();

export interface FlagSelection {
  /** Selected ids, restricted to the rows currently rendered. */
  selectedIds: ReadonlySet<string>;
  /** `selectedIds.size`, for the bulk bar's count. */
  count: number;
  /** True when every row on screen is selected (and there is at least one). */
  allSelected: boolean;
  /** True when some but not all rows are selected - the header's indeterminate state. */
  someSelected: boolean;
  isSelected: (flagId: string) => boolean;
  toggle: (flagId: string) => void;
  /** Select every row on screen, or clear them all if they already are. */
  toggleAll: () => void;
  clear: () => void;
}

/**
 * @param rows The rows on screen, in render order. Pass the windowed page - not
 * the full filtered list - so "select all" means what the header checkbox sits
 * above.
 */
export function useFlagSelection(rows: readonly { id: string }[]): FlagSelection {
  const [raw, setRaw] = useState<ReadonlySet<string>>(EMPTY);

  const ids = useMemo(() => rows.map((row) => row.id), [rows]);

  /*
   * Held across renders so an intersection that comes out the same is handed
   * back as the same object. Without it, filtering to a narrower list of rows
   * none of which is selected would still be a new empty Set, and therefore a
   * new `ctx`, and therefore a hundred re-rendered rows for no change at all.
   */
  const previous = useRef<ReadonlySet<string>>(EMPTY);

  const selectedIds = useMemo(() => {
    // `ids` is a fresh array whenever the row list changes, which is exactly
    // when this needs recomputing.
    if (raw.size === 0) return EMPTY;
    const next = ids.filter((id) => raw.has(id));
    const last = previous.current;
    if (next.length === last.size && next.every((id) => last.has(id))) return last;
    const result: ReadonlySet<string> = new Set(next);
    previous.current = result;
    return result;
  }, [ids, raw]);

  const toggle = useCallback((flagId: string) => {
    setRaw((current) => {
      const next = new Set(current);
      if (!next.delete(flagId)) next.add(flagId);
      return next;
    });
  }, []);

  const allSelected = ids.length > 0 && selectedIds.size === ids.length;

  const toggleAll = useCallback(() => {
    setRaw((current) => {
      const onScreen = ids.filter((id) => current.has(id)).length;
      // Everything on screen already ticked -> this is a "clear", and it clears
      // only what is on screen, leaving an off-screen selection alone.
      if (onScreen === ids.length) {
        const next = new Set(current);
        for (const id of ids) next.delete(id);
        return next;
      }
      return new Set([...current, ...ids]);
    });
  }, [ids]);

  const clear = useCallback(() => setRaw(EMPTY), []);

  /*
   * `allSelected` is in the deps rather than recomputed inside, because it
   * depends on `ids.length` as well as on the selection: ticking every row on a
   * page of five and then loading five more must stop claiming "all".
   */
  return useMemo(
    () => ({
      selectedIds,
      count: selectedIds.size,
      allSelected,
      someSelected: selectedIds.size > 0 && !allSelected,
      isSelected: (flagId: string) => selectedIds.has(flagId),
      toggle,
      toggleAll,
      clear,
    }),
    [selectedIds, allSelected, toggle, toggleAll, clear],
  );
}
