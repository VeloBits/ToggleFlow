/**
 * "Switch organization / project" - a filterable list, reached from a scope
 * picker whose menu has more entries than it can usefully show inline.
 *
 * Why this is a dialog and not a search box inside the dropdown: Radix's
 * DropdownMenu owns focus for its whole lifetime and deliberately makes the
 * `onOpenAutoFocus` escape hatch private (it is `Omit`ted from the public
 * content props), so a text input inside a menu can only be focused by
 * fighting the primitive. Dialog exposes the same hook publicly, which makes
 * this the supported place to put a field. The short lists most users see
 * never come here at all - the menu's own typeahead is faster.
 */
import { useMemo, useRef, useState } from 'react';

import { Dialog } from '../../ui/dialog';
import { CheckIcon, SearchIcon } from '../../ui/icons';
import { cn } from '../../ui/cn';
import type { ScopeOption } from './ScopePicker';

export function ScopeSwitcherDialog({
  title,
  options,
  selectedId,
  onSelect,
  onClose,
}: {
  title: string;
  options: ScopeOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(needle) || (o.meta ?? '').toLowerCase().includes(needle),
    );
  }, [options, query]);

  /**
   * Arrow keys move real DOM focus between the rows rather than tracking an
   * `aria-activedescendant`: the rows are ordinary buttons, so focus, Enter,
   * and every screen reader's button semantics all work without being
   * re-implemented. ArrowDown from the field enters the list; ArrowUp off the
   * top of the list returns to the field, so the filter is never trapped.
   */
  const rows = () => Array.from(listRef.current?.querySelectorAll('button') ?? []);
  const focusRow = (index: number) => {
    const all = rows();
    if (all.length === 0) return;
    const wrapped = (index + all.length) % all.length;
    all[wrapped]?.focus();
  };

  return (
    <Dialog
      title={title}
      onClose={onClose}
      className="w-[28rem] p-0"
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        inputRef.current?.focus();
      }}
    >
      <div className="border-border relative border-b">
        <SearchIcon
          size={15}
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2"
        />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowDown') return;
            e.preventDefault();
            focusRow(0);
          }}
          placeholder="Filter by name…"
          aria-label={title}
          className="w-full rounded-none border-0 bg-transparent py-2.5 pr-3 pl-9 text-[13px] outline-none"
        />
      </div>

      <div
        ref={listRef}
        className="max-h-[18rem] overflow-y-auto p-1.5"
        onKeyDown={(e) => {
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
          e.preventDefault();
          const all = rows();
          const current = all.indexOf(document.activeElement as HTMLButtonElement);
          if (e.key === 'ArrowUp' && current === 0) {
            inputRef.current?.focus();
            return;
          }
          focusRow(current + (e.key === 'ArrowDown' ? 1 : -1));
        }}
      >
        {matches.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => {
              onSelect(option.id);
              onClose();
            }}
            className={cn(
              'hover:bg-highlight focus-visible:ring-ring flex w-full items-center gap-2.5 rounded-md border-0 bg-transparent px-2.5 py-2 text-left text-[13px] focus-visible:ring-2 focus-visible:outline-none',
              option.id === selectedId ? 'text-text font-medium' : 'text-muted-foreground',
            )}
          >
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
          </button>
        ))}
        {matches.length === 0 && (
          <p className="text-muted-foreground px-2.5 py-6 text-center text-[13px]">
            Nothing matches “{query.trim()}”.
          </p>
        )}
      </div>
    </Dialog>
  );
}
