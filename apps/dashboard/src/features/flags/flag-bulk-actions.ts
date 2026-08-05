/**
 * What can be done to a set of selected flags, as data.
 *
 * ## The extension contract
 *
 * A new bulk action is one entry in `BULK_ACTIONS`. It has to supply:
 *
 *   - `id` — stable; the arming key and the React key, never switched on;
 *   - `label(applicable)` — the button's text, counting the rows it will change
 *     rather than the rows that are ticked;
 *   - `summary(succeeded)` — the same sentence in the past tense, for the one
 *     summary toast;
 *   - `icon` + `tone` — the icon from `src/ui/icons.tsx`, and `tone` doubling as
 *     the armed button's variant;
 *   - `applies(flag)` — the rows it would change;
 *   - and how it runs: `kind: 'immediate'` with a `patch` body, or
 *     `kind: 'dialog'` with a component that collects input and yields one.
 *
 * It gets, without touching anything else: the exact count in its label, the
 * skipped-row report (`describeSkipped`), the production arming step, bounded
 * concurrency, one summary toast naming the failures, a single cache
 * invalidation, a progress readout and the disabled-while-running state.
 * `FlagsBulkBar` never branches on an action's identity, so "Archive selected"
 * or "Add tag" costs an entry here and a dialog if it needs one.
 *
 * ## Why a discriminated union rather than an optional dialog
 *
 * "Runs at once" and "asks something first" are two shapes, not one shape with a
 * nullable field: with `kind` the bar cannot render a dialog-less dialog action
 * or send a body it never collected, because neither type has both fields. It
 * also keeps "does this need a dialog?" out of the bar's own logic - the bar
 * matches on `kind` in one place and everything after that is the same code
 * path.
 *
 * `patch` is one body for every target rather than a function of the row. Every
 * action so far sends the same body to all of them, and a `(flag) => FlagPatch`
 * today would be a function returning a constant at three call sites. It is the
 * obvious generalisation when an action needs it; it is not needed yet.
 */
import type { ComponentType } from 'react';

import { CircleCheckIcon, CircleHalfIcon, CircleSlashIcon, type IconProps } from '@/ui/icons';

import { BulkRolloutDialog } from './BulkRolloutDialog';
import type { FlagRow } from './flag-columns';
import type { FlagSelection } from './flag-selection';
import { flagStatus, type FlagStatus } from './FlagStatusBadge';
import type { FlagPatch } from './use-flag-mutations';

/**
 * "1 flag" / "12 flags". A function declaration, not a const: `BulkRolloutDialog`
 * imports it while this module is still initialising (this module imports the
 * dialog for the registry below), and only a hoisted declaration is safe to call
 * either way round.
 */
export function flagCount(count: number): string {
  return `${count} ${count === 1 ? 'flag' : 'flags'}`;
}

/** What a dialog action's component is handed, and what it must hand back. */
export interface BulkDialogProps {
  /** The rows the emitted patch will be applied to - already filtered by `applies`. */
  targets: readonly FlagRow[];
  environmentName: string;
  /** True on production, where naming the environment on the submit is the second gesture. */
  isProd: boolean;
  onCancel: () => void;
  /** Closes the dialog and starts the run; the bar owns progress from here. */
  onApply: (patch: FlagPatch) => void;
}

interface BulkActionShape {
  id: string;
  label: (applicable: number) => string;
  summary: (succeeded: number) => string;
  icon: ComponentType<IconProps>;
  /** Doubles as the armed button's variant, which is why these are Button's own names. */
  tone: 'default' | 'destructive';
  /**
   * The rows this action would change. Rows it rejects are reported by the bar
   * rather than patched into a no-op: N pointless PATCHes are N audit entries
   * and N ruleset publishes, and "Disable 12 flags" that only moves 2 of them is
   * a lie the count is there to prevent.
   */
  applies: (flag: FlagRow) => boolean;
}

export interface ImmediateBulkAction extends BulkActionShape {
  kind: 'immediate';
  patch: FlagPatch;
}

export interface DialogBulkAction extends BulkActionShape {
  kind: 'dialog';
  Dialog: ComponentType<BulkDialogProps>;
}

export type BulkAction = ImmediateBulkAction | DialogBulkAction;

/*
 * Each action wears the badge of the state it produces - `FlagStatusBadge`'s own
 * glyphs for ON, OFF and ROLLOUT. A separate set of verbs (a power symbol, a
 * pencil) would mean two icon vocabularies for the same three states on one
 * screen, with the row badges saying one thing and the buttons another.
 */
const ENABLE: ImmediateBulkAction = {
  kind: 'immediate',
  id: 'enable',
  label: (n) => `Enable ${flagCount(n)}`,
  summary: (n) => `Turned on ${flagCount(n)}`,
  icon: CircleCheckIcon,
  tone: 'default',
  patch: { enabled: true },
  /*
   * `rolloutPercent` is deliberately untouched: an off flag configured for 25%
   * comes back at 25%, and a flag already rolling out is already on, so it is
   * not a target at all. Clearing the rollout on enable would promote a canary
   * to a full release with nothing in the button to say so.
   */
  applies: (flag) => !flag.archived && !flag.enabled,
};

const DISABLE: ImmediateBulkAction = {
  kind: 'immediate',
  id: 'disable',
  label: (n) => `Disable ${flagCount(n)}`,
  summary: (n) => `Turned off ${flagCount(n)}`,
  icon: CircleSlashIcon,
  tone: 'destructive',
  patch: { enabled: false },
  applies: (flag) => !flag.archived && flag.enabled,
};

const CONFIGURE_ROLLOUT: DialogBulkAction = {
  kind: 'dialog',
  id: 'rollout',
  // The ellipsis is the conventional mark for "this opens something", and the
  // count is left to the dialog, which has room to name it and the environment
  // in a sentence.
  label: () => 'Configure rollout…',
  summary: (n) => `Rollout set on ${flagCount(n)}`,
  icon: CircleHalfIcon,
  tone: 'default',
  Dialog: BulkRolloutDialog,
  /*
   * Every live flag, including ones already rolling out: the target percentage
   * is not known until the dialog answers, so a predicate that skipped "already
   * at that percentage" cannot be written here - and re-stating 10% on a flag
   * already at 10% is what someone selecting twelve flags and typing 10 means.
   */
  applies: (flag) => !flag.archived,
};

export const BULK_ACTIONS: BulkAction[] = [ENABLE, DISABLE, CONFIGURE_ROLLOUT];

/** An action split against the current selection: what it will change, and what it will not. */
export interface BulkPlan {
  action: BulkAction;
  targets: FlagRow[];
  skipped: FlagRow[];
}

export function planBulkAction(action: BulkAction, selected: readonly FlagRow[]): BulkPlan {
  const targets: FlagRow[] = [];
  const skipped: FlagRow[] = [];
  for (const flag of selected) (action.applies(flag) ? targets : skipped).push(flag);
  return { action, targets, skipped };
}

/** The selected rows, in render order - `FlagSelection` holds ids, actions need rows. */
export function selectedRows(rows: readonly FlagRow[], selection: FlagSelection): FlagRow[] {
  return rows.filter((row) => selection.isSelected(row.id));
}

const SKIP_LABELS: Record<FlagStatus, string> = {
  off: 'already off',
  rollout: 'already rolling out',
  on: 'already on',
  archived: 'archived',
};

/**
 * Why the rows an action rejects are being left alone, counted by state.
 *
 * Derived from `flagStatus` rather than written per action, so a new action gets
 * the explanation free and cannot ship with one that has drifted from its own
 * predicate. Rendered as the button's `title`: the count in the label is the
 * headline ("Enable 2 flags" out of 12 selected), this is the footnote.
 *
 * Ordered by `SKIP_LABELS`' keys rather than by frequency, so the same skip set
 * always reads the same way.
 */
export function describeSkipped(skipped: readonly FlagRow[]): string | null {
  if (skipped.length === 0) return null;
  const counts = new Map<FlagStatus, number>();
  for (const flag of skipped) {
    const status = flagStatus(flag);
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  const parts = (Object.keys(SKIP_LABELS) as FlagStatus[])
    .filter((status) => counts.has(status))
    .map((status) => `${counts.get(status)} ${SKIP_LABELS[status]}`);
  return `Leaves ${skipped.length} of the selected flags alone: ${parts.join(', ')}.`;
}
