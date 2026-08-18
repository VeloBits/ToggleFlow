/**
 * "Switch organization / project" — a filterable list, reached from a scope
 * picker whose menu has more entries than it can usefully show inline.
 *
 * Why this is a dialog and not a search box inside the dropdown: Radix's
 * DropdownMenu owns focus for its whole lifetime and deliberately makes the
 * `onOpenAutoFocus` escape hatch private (it is `Omit`ted from the public content
 * props), so a text input inside a menu can only be focused by fighting the
 * primitive. Dialog exposes the same hook publicly, which makes this the
 * supported place to put a field. The short lists most users see never come here
 * at all — the menu's own typeahead is faster.
 *
 * ## This is now `CommandDialog`, and it deleted the hard part
 *
 * The previous version hand-rolled the filtering, and then hand-rolled roving
 * focus over `listRef.current.querySelectorAll('button')` with wrap-around and a
 * special case for ArrowUp off the top returning to the field. That is `cmdk`'s
 * entire job, and `cmdk` also gets the parts that were missing: the list is a
 * real `role="listbox"` with `aria-activedescendant`, so the filter field keeps
 * focus (and keeps accepting typing) while the highlight moves — where moving
 * real DOM focus into the list meant the next keystroke went to a button.
 *
 * ## Substring matching, not cmdk's fuzzy default
 *
 * `cmdk` scores by subsequence, which is right for a command palette — "gp"
 * should find "git push". It is wrong for a list of names the user is reading
 * off the screen: typing "org 11" also matches "Org 10" (o-r-g-space-1, then a
 * second 1 out of "org-10"), so the thing you are narrowing towards never
 * actually narrows.
 *
 * The `filter` below restores plain case-insensitive substring matching over the
 * label and the meta — what this list did before, and what a scope switcher
 * wants.
 *
 * That is also why this composes `Dialog` + `CommandPalette` rather than using
 * `CommandDialog`: `CommandDialog`'s props are the Dialog root's, so it has
 * nowhere to take a `filter` and does not forward one to the palette it renders.
 * Everything it would have supplied is reproduced below from the same
 * components — the frame, the sr-only title and description, the unpadded
 * content — so this is a different composition of the system, not a bypass of it.
 */
import { CheckIcon } from '@velobits-dev/icons';
import {
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPalette,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@velobits-dev/ui';

import { cn } from '../../ui/cn';
import type { ScopeOption } from './ScopePicker';

/**
 * `value` is a unique key; `keywords` is what the user matches against. They are
 * separate because two projects legitimately share a name, and cmdk treats two
 * items with the same `value` as the same item — both would highlight together.
 */
function matchOption(_value: string, search: string, keywords?: string[]): number {
  const needle = search.trim().toLowerCase();
  if (!needle) return 1;
  return (keywords ?? []).join(' ').toLowerCase().includes(needle) ? 1 : 0;
}

export function ScopeSwitcherDialog({
  open,
  onOpenChange,
  title,
  options,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  options: ScopeOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
       * Top-anchored and unpadded, because the list grows downwards as the user
       * types and a vertically centred palette jumps on every keystroke.
       * `showCloseButton={false}`: Esc closes it, and a ✕ floating over a search
       * field is the sort of thing that gets clicked by accident.
       */}
      <DialogContent
        size="md"
        showCloseButton={false}
        className="top-[15vh] translate-y-0 gap-0 overflow-hidden p-0"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">
          Filter by name, then press Enter to switch.
        </DialogDescription>
        <CommandPalette filter={matchOption} className="rounded-none border-0 bg-transparent">
          <CommandInput aria-label={title} placeholder="Filter by name…" />
          <CommandList>
            <CommandEmpty>Nothing matches.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={option.id}
                  keywords={[option.label, option.meta ?? '']}
                  onSelect={() => {
                    onSelect(option.id);
                    onOpenChange(false);
                  }}
                  className={cn(option.id === selectedId && 'text-fg font-medium')}
                >
                  {option.dotClassName && (
                    <span
                      aria-hidden
                      className={cn('size-2 shrink-0 rounded-full', option.dotClassName)}
                    />
                  )}
                  <span className="truncate">{option.label}</span>
                  {option.meta && (
                    <span className="text-muted-foreground ml-auto shrink-0 text-[11.5px]">
                      {option.meta}
                    </span>
                  )}
                  <CheckIcon
                    size={14}
                    className={cn(
                      'text-primary shrink-0',
                      option.meta ? '' : 'ml-auto',
                      option.id !== selectedId && 'invisible',
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </CommandPalette>
      </DialogContent>
    </Dialog>
  );
}
