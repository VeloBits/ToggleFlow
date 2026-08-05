import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { type ReactNode } from 'react';

import { cn } from './cn';

export interface SegmentOption {
  value: string;
  label: ReactNode;
  /** 'danger' renders the selected state in the off/prod color (e.g. production env). */
  tone?: 'default' | 'danger';
}

/**
 * Single-select segmented control (Radix ToggleGroup) - designed for the
 * env switcher (dashboard v2) but generic. Selection can never be empty.
 *
 * ## Naming, and why `aria-label` is not the only way in
 *
 * The root is a `div` (Radix gives it `role="radiogroup"`), so a caller's
 * `<Label htmlFor>` cannot bind to it - `htmlFor` reaches labelable elements
 * only, and the naive pairing leaves a dangling `for`: no accessible name, and
 * clicking the label silently does nothing. Callers with a visible `<Label>`
 * therefore pass `id` plus `labelledBy` and skip `aria-label`; callers with no
 * visible label pass `aria-label`. Exactly one of the two is required, which the
 * overloaded prop type enforces at the call site rather than in a comment.
 *
 * `disabled` is forwarded to every item rather than applied as
 * `pointer-events-none opacity-50` on the root, which is what two call sites
 * were doing: that dims the control and blocks the mouse while leaving it fully
 * operable by keyboard, so the one user it misleads is the one it should protect.
 */
export function SegmentedControl({
  value,
  onValueChange,
  options,
  id,
  'aria-label': ariaLabel,
  labelledBy,
  describedBy,
  disabled = false,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SegmentOption[];
  id?: string;
  describedBy?: string;
  disabled?: boolean;
  className?: string;
} & (
  | { 'aria-label': string; labelledBy?: never }
  /** Id of the visible `<Label>` that names this control. */
  | { 'aria-label'?: never; labelledBy: string }
)) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onValueChange(next);
      }}
      id={id}
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      className={cn(
        'border-border bg-bg2 inline-flex rounded-md border p-0.5',
        disabled && 'opacity-50',
        className,
      )}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          className={cn(
            'text-muted-foreground rounded-sm px-2.5 py-1 text-[12.5px] font-medium',
            'disabled:cursor-not-allowed',
            'data-[state=on]:bg-panel data-[state=on]:shadow-sm',
            option.tone === 'danger' ? 'data-[state=on]:text-off' : 'data-[state=on]:text-text',
          )}
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
