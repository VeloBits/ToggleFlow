/**
 * The bar that appears when flags are selected: the count, one button per entry
 * in `BULK_ACTIONS`, and a way out.
 *
 * It knows nothing about enabling, disabling or rollouts - it renders the
 * registry, so a fourth action appears here by existing. See
 * `flag-bulk-actions.ts` for what an entry has to supply.
 *
 * ## Where it sits, and why not at the bottom
 *
 * Above the list, below the toolbar, outside the `Card` - and `sticky top-0`, so
 * it stays reachable after scrolling a hundred rows.
 *
 * A floating bar across the bottom of the viewport is the more fashionable answer
 * and is rejected twice over. It covers the last rows of the list, which are
 * exactly the rows someone ticking their way down the page has just selected; and
 * the obvious variant - sticky to the bottom of the card - cannot work at all,
 * because the card is `overflow-hidden`, which makes it a scroll container whose
 * scrollport is the height of its own content, so a sticky child inside it never
 * has anywhere to stick. Above the list it also sits next to the filter that
 * produced the selection, and lands in Tab order straight after the toolbar
 * rather than after every row.
 *
 * ## Keyboard
 *
 * Escape clears the selection from anywhere in the list, since focus is usually
 * still on the last checkbox rather than in here. Suppressed while a dialog is
 * open (Escape belongs to the dialog) and while a run is in flight (clearing
 * would unmount the bar and take the progress readout with it).
 */
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useWorkspace } from '@/state/WorkspaceContext';
import { XIcon } from '@/ui/icons';
import { cn } from '@/ui/cn';

import type { FlagRow } from './flag-columns';
import type { FlagSelection } from './flag-selection';
import {
  BULK_ACTIONS,
  describeSkipped,
  flagCount,
  planBulkAction,
  selectedRows,
  type BulkAction,
  type DialogBulkAction,
} from './flag-bulk-actions';
import { useBulkFlagPatch, type FlagPatch } from './use-flag-mutations';

/** An armed button belongs to the exact selection it was armed against. */
const sameIds = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  a.size === b.size && [...a].every((id) => b.has(id));

export function FlagsBulkBar({
  selection,
  rows,
}: {
  selection: FlagSelection;
  /** The rows on screen, so ids can be resolved to the flags an action judges. */
  rows: readonly FlagRow[];
}) {
  const ws = useWorkspace();
  const bulk = useBulkFlagPatch(ws.environmentId);
  const [armed, setArmed] = useState<{ id: string; ids: ReadonlySet<string> } | null>(null);
  const [dialog, setDialog] = useState<DialogBulkAction | null>(null);

  /*
   * `ws.environment!` is the invariant, not optimism: the bar renders only when a
   * row is selected, and there are no rows to select without an environment - the
   * page returns `NoEnvironmentState` before it gets here. A `?.` plus a fallback
   * name would be two branches that cannot be taken, untestable by construction.
   */
  const environment = ws.environment!;
  // The same test as `FlagsPage`'s `requireConfirm` and `FlagStatePanel`'s `isProd`.
  const isProd = environment.key === 'prod';
  const environmentName = environment.name;
  const selected = selectedRows(rows, selection);

  /*
   * Disarm when the selection moves, during render rather than in an effect -
   * `AuditLogPage`'s pattern, for `flag-selection.ts`'s reason: an effect paints
   * once with a button that is still armed for a set it no longer means.
   *
   * This is the timeout `ConfirmButton` uses, replaced by something stronger.
   * Four seconds stops an armed button being fired by a later, unrelated click;
   * it does nothing about an armed "Disable 12 flags" quietly becoming "Disable
   * 30 flags" when a filter is cleared, which on production is the failure that
   * matters. Binding the arming to the ids covers both, and needs no timer.
   */
  if (armed && !sameIds(armed.ids, selection.selectedIds)) setArmed(null);

  const dialogOpen = dialog !== null;
  // Pulled out of `selection` because it is the stable half: `clear` is a
  // `useCallback`, while `selection` itself is a fresh object every render and
  // would have this listener re-subscribing on each one.
  const { clear } = selection;
  useEffect(() => {
    if (dialogOpen || bulk.running) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') clear();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialogOpen, bulk.running, clear]);

  const start = async (action: BulkAction, targets: FlagRow[], patch: FlagPatch) => {
    const result = await bulk.run({
      targets: targets.map((flag) => ({ flagId: flag.id, flagKey: flag.key })),
      patch,
      summary: action.summary,
    });
    /*
     * Cleared on a clean run only. After a partial failure the selection is worth
     * more than it was: every action's `applies` has already dropped the rows that
     * did move, so the same button now names exactly the ones that did not, and
     * the retry is one click with an honest count.
     */
    if (result.failed.length === 0) clear();
  };

  const activate = (action: BulkAction, targets: FlagRow[]) => {
    if (action.kind === 'dialog') {
      setDialog(action);
      return;
    }
    // Production asks twice, for every action rather than only the destructive
    // one: enabling twelve flags at once is also a change to what production
    // serves, and a bar where some gestures are guarded teaches that the others
    // are safe.
    if (isProd && armed?.id !== action.id) {
      setArmed({ id: action.id, ids: selection.selectedIds });
      return;
    }
    setArmed(null);
    void start(action, targets, action.patch);
  };

  return (
    <div
      // `group`, not `toolbar`: a toolbar promises arrow-key navigation between
      // its controls, which these are not wired for. Tab reaches them in order.
      role="group"
      aria-label="Bulk actions"
      className="border-border bg-panel sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 shadow-sm"
    >
      <span className="text-text text-[13px] font-semibold tabular-nums">
        {flagCount(selection.count)} selected
      </span>
      <Separator orientation="vertical" className="hidden h-5 sm:block" />

      {BULK_ACTIONS.map((action) => {
        const { targets, skipped } = planBulkAction(action, selected);
        const Icon = action.icon;
        const isArmed = armed?.id === action.id;
        return (
          <Button
            key={action.id}
            size="sm"
            // `tone` is Button's own variant name, so the armed state needs no map.
            variant={isArmed ? action.tone : 'outline'}
            className={cn(!isArmed && action.tone === 'destructive' && 'text-destructive')}
            /*
             * Disabled, never hidden, when an action has nothing to do - a button
             * that vanishes when 12 flags are already on leaves the absence to be
             * decoded, where "Enable 0 flags" plus the title says it outright.
             */
            disabled={bulk.running || targets.length === 0}
            title={describeSkipped(skipped) ?? undefined}
            onClick={() => activate(action, targets)}
          >
            <Icon size={14} />
            {isArmed
              ? `Confirm in ${environmentName} — ${action.label(targets.length)}`
              : action.label(targets.length)}
          </Button>
        );
      })}

      {bulk.progress && (
        <span role="status" className="text-muted-foreground text-[12.5px] tabular-nums">
          {bulk.progress.done} of {bulk.progress.total} done…
        </span>
      )}

      <Button variant="ghost" size="sm" className="ml-auto" disabled={bulk.running} onClick={clear}>
        <XIcon size={13} /> Clear
      </Button>

      {dialog && (
        <dialog.Dialog
          targets={planBulkAction(dialog, selected).targets}
          environmentName={environmentName}
          isProd={isProd}
          onCancel={() => setDialog(null)}
          onApply={(patch) => {
            const { targets } = planBulkAction(dialog, selected);
            setDialog(null);
            void start(dialog, targets, patch);
          }}
        />
      )}
    </div>
  );
}
