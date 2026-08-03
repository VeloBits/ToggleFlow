/**
 * Menu primitives on Radix DropdownMenu, styled to the VeloBits tokens.
 *
 * Radix rather than a hand-rolled popover because every behaviour a menu needs
 * is a behaviour someone gets wrong by hand: roving focus with arrow keys,
 * typeahead, Esc and outside-click dismissal, focus return to the trigger,
 * collision-aware positioning, scroll locking, and the `aria-expanded` /
 * `role="menuitem"` wiring that makes it legible to a screen reader. The
 * dialogs, toasts and segmented control in this app are already Radix
 * (design-system decision, TOGGLEFLOW_UX_DESIGN §8.2), so this adds a package
 * from a family already present rather than a new vendor.
 *
 * Everything here is presentation-only - the org, project and environment
 * pickers and the account footer all compose these same parts, so a change to
 * menu padding or the focus ring happens once.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from './cn';
import { CheckIcon } from './icons';

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

/**
 * `--radix-dropdown-menu-content-available-height` is Radix's measurement of
 * the space left before the viewport edge. Capping on it (rather than a fixed
 * px max-height) is what lets a user in 40 orgs get a scrolling menu on a
 * laptop and a taller one on a monitor, without either overflowing the screen.
 */
export function MenuContent({
  children,
  className,
  align = 'start',
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align={align}
        sideOffset={6}
        collisionPadding={8}
        className={cn(
          'border-border bg-panel z-40 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-56 overflow-y-auto rounded-lg border p-1 shadow-[0_12px_32px_rgba(0,0,0,0.14)] dark:shadow-[0_12px_32px_rgba(0,0,0,0.55)]',
          className,
        )}
        {...props}
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

/**
 * `data-highlighted` is Radix's single source of truth for "the item the user
 * is on", whether they got there with a pointer or the arrow keys. Styling
 * that instead of `:hover` + `:focus` separately is what keeps keyboard and
 * mouse navigation looking identical.
 */
const ITEM = [
  'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] outline-none select-none',
  'data-[highlighted]:bg-highlight data-[highlighted]:text-text',
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
].join(' ');

export function MenuItem({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenu.Item>) {
  return (
    <DropdownMenu.Item className={cn(ITEM, 'text-text', className)} {...props}>
      {children}
    </DropdownMenu.Item>
  );
}

/**
 * A menu row that represents a current selection. The check column is always
 * reserved, selected or not, so labels stay on one left edge and the list does
 * not jump as the selection moves.
 */
export function MenuRadioItem({
  children,
  selected,
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenu.Item> & { selected: boolean }) {
  return (
    <DropdownMenu.Item
      className={cn(ITEM, selected ? 'text-text font-medium' : 'text-muted', className)}
      // Radix only sets aria-checked on its own RadioItem; these are plain
      // items (they navigate as well as select), so the state is stated here.
      role="menuitemradio"
      aria-checked={selected}
      {...props}
    >
      {children}
      <CheckIcon
        size={14}
        className={cn('text-accent ml-auto shrink-0', !selected && 'invisible')}
      />
    </DropdownMenu.Item>
  );
}

export function MenuSeparator({ className }: { className?: string }) {
  return <DropdownMenu.Separator className={cn('bg-border/70 -mx-1 my-1 h-px', className)} />;
}

/** Small uppercase caption above a group of rows ("Organizations", "Account"). */
export function MenuLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <DropdownMenu.Label
      className={cn(
        'text-muted px-2 pt-1.5 pb-1 text-[11px] font-semibold tracking-[0.04em] uppercase',
        className,
      )}
    >
      {children}
    </DropdownMenu.Label>
  );
}
