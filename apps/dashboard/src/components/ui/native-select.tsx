/**
 * A native `<select>` styled to match the shadcn field primitives.
 *
 * Hand-written rather than `shadcn add select`, which is a deliberate choice
 * rather than an omission:
 *
 *  - Radix Select needs `hasPointerCapture`, `ResizeObserver` and
 *    `scrollIntoView`. happy-dom (this app's test environment) does not supply
 *    them reliably, so the single most-used control on the Flags surface would
 *    be the one control the suite cannot drive. A native select is one
 *    `fireEvent.change` away.
 *  - It needs no portal, so it works inside a Radix Dialog without fighting
 *    FocusScope - see the focus-redirect note in `src/ui/dialog.tsx`.
 *  - Inside a form, a native select is what keyboard and screen-reader users
 *    already know, on desktop and on mobile.
 *
 * `src/components/nav/CreateScopeDialogs.tsx` already makes this argument for
 * its "inherit from" field; this is the same call, generalised.
 *
 * Trade-off, stated plainly: option rows cannot carry custom markup (no colour
 * swatches, no two-line options). When a picker needs that, it wants a
 * Dialog-based list like `ScopeSwitcherDialog`, not a fancier dropdown.
 */
import * as React from 'react';

import { ChevronDownIcon } from '@/ui/icons';
import { cn } from '@/ui/cn';

function NativeSelect({
  className,
  wrapperClassName,
  children,
  ...props
}: React.ComponentProps<'select'> & {
  /**
   * Sizing for the positioning wrapper. The chevron is absolutely positioned
   * against it, so constraining the *select* alone leaves the arrow stranded at
   * the far edge of whatever cell the control sits in - width has to be set here
   * to keep the two together.
   */
  wrapperClassName?: string;
}) {
  return (
    <div className={cn('relative w-full', wrapperClassName)}>
      <select
        data-slot="native-select"
        className={cn(
          // Mirrors ui/input.tsx's box so a select and an input in the same
          // form are the same height, radius and border.
          'border-input bg-background text-foreground flex h-9 w-full appearance-none rounded-md border py-1 pr-8 pl-3 text-sm shadow-xs transition-[color,box-shadow] outline-none',
          'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon
        size={16}
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2"
      />
    </div>
  );
}

export { NativeSelect };
