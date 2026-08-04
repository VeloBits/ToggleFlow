/**
 * The four states a flag row can be in, as one badge.
 *
 * Successor to `StatusChip` in `src/components/ui.tsx`, which stays because
 * Segments and Search still render it. The differences that matter: this one
 * knows about `archived` (previously a second loose `.tag` beside the chip), and
 * it carries an icon as well as a colour, because colour alone fails for the
 * ~8% of men with a red/green deficiency - and ON vs OFF is exactly the
 * distinction this product exists to make unambiguous.
 */
import type { ComponentType } from 'react';

import { Badge } from '@/components/ui/badge';
import { CircleCheckIcon, CircleHalfIcon, CircleSlashIcon, type IconProps } from '@/ui/icons';
import { cn } from '@/ui/cn';

export type FlagStatus = 'on' | 'off' | 'rollout' | 'archived';

/**
 * Sort order is `off < rollout < on < archived`, and it is deliberate: sorting
 * by status should surface what is switched off first, because that is what
 * someone opening this page during an incident is looking for. Archived sorts
 * last because it is not a live state at all.
 */
export const STATUS_ORDER: Record<FlagStatus, number> = {
  off: 0,
  rollout: 1,
  on: 2,
  archived: 3,
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

const PRESENTATION: Record<
  FlagStatus,
  { icon: ComponentType<IconProps>; className: string; label: string }
> = {
  on: { icon: CircleCheckIcon, className: 'bg-on-soft text-on', label: 'ON' },
  off: { icon: CircleSlashIcon, className: 'bg-off-soft text-off', label: 'OFF' },
  rollout: { icon: CircleHalfIcon, className: 'bg-rollout-soft text-rollout', label: 'ROLLOUT' },
  archived: {
    icon: CircleSlashIcon,
    className: 'bg-muted text-muted-foreground',
    label: 'ARCHIVED',
  },
};

export function FlagStatusBadge({
  flag,
  className,
}: {
  flag: { enabled: boolean; rolloutPercent: number | null; archived: boolean };
  className?: string;
}) {
  const status = flagStatus(flag);
  const { icon: Icon, className: tone, label } = PRESENTATION[status];
  // A rollout shows its percentage instead of the word: "25%" is strictly more
  // information than "ROLLOUT" in the same space.
  const text = status === 'rollout' ? `${flag.rolloutPercent}%` : label;

  return (
    <Badge
      variant="secondary"
      className={cn('gap-1 border-transparent px-1.5 font-semibold tabular-nums', tone, className)}
    >
      <Icon size={11} />
      {text}
    </Badge>
  );
}
