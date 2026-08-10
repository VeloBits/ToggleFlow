/**
 * The four states a flag row can be in, as one chip.
 *
 * The paint is now the design system's `StatusChip` — it already carries the
 * icon-as-second-channel rule this file was written for (colour alone fails the
 * ~8% of men with a red/green deficiency, and ON vs OFF is exactly the
 * distinction this product exists to make unambiguous), and its `bg-*-soft` /
 * `text-*` pairs are gated for contrast over the page, the panel and glass in
 * both themes. Re-deriving those pairs here is what this file used to do, and it
 * is what made a chip in the flags table capable of drifting from the identical
 * chip in Segments and Search.
 *
 * What stays here is the part the system cannot know: the app's `FlagStatus`
 * vocabulary, which has a fourth member (`archived`) and calls a partial rollout
 * a `rollout`.
 */
import { STATUS_ORDER as SYSTEM_STATUS_ORDER, StatusChip, type Status } from '@velobits-dev/ui';

export type FlagStatus = 'on' | 'off' | 'rollout' | 'archived';

/**
 * The app's word for a state, mapped onto the system's.
 *
 * Only `rollout` moves, and only in name: a rollout chip has always rendered its
 * percentage rather than the word, so nothing a user reads changes.
 */
const TO_STATUS: Record<FlagStatus, Status> = {
  on: 'on',
  off: 'off',
  rollout: 'partial',
  archived: 'archived',
};

/**
 * Sort order is `off < rollout < on < archived`, and it is deliberate: sorting
 * by status should surface what is switched off first, because that is what
 * someone opening this page during an incident is looking for. Archived sorts
 * last because it is not a live state at all.
 *
 * Taken from the system's own ordering rather than restated, because the system
 * made the same call for the same reason. Read through `TO_STATUS`, so the two
 * cannot disagree; the numbers are not contiguous (the system has a `pending`
 * this app has no use for) and nothing may depend on them being so — only on
 * the relative order, which `flags-sort.ts` is the sole consumer of.
 */
export const STATUS_ORDER: Record<FlagStatus, number> = {
  off: SYSTEM_STATUS_ORDER[TO_STATUS.off],
  rollout: SYSTEM_STATUS_ORDER[TO_STATUS.rollout],
  on: SYSTEM_STATUS_ORDER[TO_STATUS.on],
  archived: SYSTEM_STATUS_ORDER[TO_STATUS.archived],
};

export function flagStatus(flag: {
  enabled: boolean;
  rolloutPercent: number | null;
  archived: boolean;
}): FlagStatus {
  if (flag.archived) return 'archived';
  if (!flag.enabled) return 'off';
  return flag.rolloutPercent !== null ? 'rollout' : 'on';
}

export function FlagStatusBadge({
  flag,
  className,
}: {
  flag: { enabled: boolean; rolloutPercent: number | null; archived: boolean };
  className?: string;
}) {
  const status = flagStatus(flag);

  /*
   * A rollout shows its percentage instead of the word: "25%" is strictly more
   * information than "ROLLOUT" in the same space. Every other state takes the
   * system's own label, which is sentence case in the DOM and uppercase in CSS -
   * some screen readers spell a short all-caps token letter by letter.
   */
  return (
    <StatusChip status={TO_STATUS[status]} className={className}>
      {status === 'rollout' ? `${flag.rolloutPercent}%` : undefined}
    </StatusChip>
  );
}
