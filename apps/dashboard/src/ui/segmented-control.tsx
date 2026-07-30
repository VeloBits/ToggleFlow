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
 */
export function SegmentedControl({
  value,
  onValueChange,
  options,
  'aria-label': ariaLabel,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SegmentOption[];
  'aria-label': string;
  className?: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onValueChange(next);
      }}
      aria-label={ariaLabel}
      className={cn('border-border bg-bg2 inline-flex rounded-md border p-0.5', className)}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          className={cn(
            'text-muted rounded-sm px-2.5 py-1 text-[12.5px] font-medium',
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
