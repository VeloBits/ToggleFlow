/**
 * The one control behind all three topbar selectors (organization, project,
 * environment). They differ only in their data, their leading mark, and the
 * label on their create action - so they are one component with props rather
 * than three near-identical dropdowns that drift apart.
 */
import { CheckIcon, ChevronsUpDownIcon, PlusIcon, type IconProps } from '@velobits-dev/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton,
} from '@velobits-dev/ui';
import { useState, type ComponentType, type ReactNode } from 'react';

import { cn } from '../../ui/cn';
import { ScopeSwitcherDialog } from './ScopeSwitcherDialog';

export interface ScopeOption {
  id: string;
  label: string;
  /** Right-aligned secondary text: a role for orgs, an env key for environments. */
  meta?: string;
  /** Leading dot, used by the environment picker to carry env colour. */
  dotClassName?: string;
}

/**
 * Beyond this many entries the menu stops being a menu and starts being a list
 * you scan, so the overflow moves into the filterable switcher dialog. Eight
 * is roughly where a dropdown stops fitting on a laptop above the fold while
 * still covering the overwhelming majority of accounts in one hop.
 */
const INLINE_LIMIT = 8;

const TRIGGER = [
  'group flex max-w-[15rem] items-center gap-1.5 rounded-md border-0 bg-transparent px-2 py-1 text-[13px]',
  'hover:bg-highlight focus-visible:ring-ring transition-colors duration-100 focus-visible:ring-2 focus-visible:outline-none motion-reduce:transition-none',
  'disabled:pointer-events-none disabled:opacity-60',
].join(' ');

export function ScopePicker({
  kind,
  icon: Icon,
  options,
  selectedId,
  onSelect,
  onCreate,
  createLabel,
  createDisabledReason,
  loading = false,
  emptyLabel = 'None',
}: {
  /** Singular, capitalised - drives the aria-label, the group heading and the switcher title. */
  kind: string;
  icon?: ComponentType<IconProps>;
  options: ScopeOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Omitted when the current role may not create this kind of thing. */
  onCreate?: () => void;
  createLabel: string;
  /** Shown as a disabled create row when `onCreate` is absent but the affordance still helps. */
  createDisabledReason?: string;
  loading?: boolean;
  emptyLabel?: string;
}) {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const selected = options.find((o) => o.id === selectedId) ?? null;

  /**
   * The current selection is always in the inline list even when it sorts past
   * the cut - a switcher whose menu does not show what you are currently on
   * reads as broken. When it has to be hoisted it goes first, which is also
   * where the eye looks for it.
   */
  const overflowing = options.length > INLINE_LIMIT;
  const selectedIndex = options.findIndex((o) => o.id === selectedId);
  const inline = !overflowing
    ? options
    : selectedIndex >= INLINE_LIMIT && selected
      ? [selected, ...options.filter((o) => o.id !== selectedId).slice(0, INLINE_LIMIT - 1)]
      : options.slice(0, INLINE_LIMIT);

  if (loading) {
    return <Skeleton aria-hidden className="h-[26px] w-28 rounded-md" />;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={TRIGGER}
          aria-label={selected ? `${kind}: ${selected.label}` : `Select ${kind.toLowerCase()}`}
        >
          {selected?.dotClassName ? (
            <span
              aria-hidden
              className={cn('size-2 shrink-0 rounded-full', selected.dotClassName)}
            />
          ) : (
            Icon && <Icon size={15} className="text-muted-foreground shrink-0" />
          )}
          <span
            className={cn('truncate', selected ? 'text-fg font-medium' : 'text-muted-foreground')}
          >
            {selected?.label ?? emptyLabel}
          </span>
          <ChevronsUpDownIcon
            size={13}
            className="text-muted-foreground group-hover:text-fg ml-0.5 shrink-0"
          />
        </DropdownMenuTrigger>

        <DropdownMenuContent>
          <DropdownMenuLabel>
            {kind}s{options.length > INLINE_LIMIT ? ` · ${options.length}` : ''}
          </DropdownMenuLabel>
          {inline.map((option) => (
            /*
             * A plain item wearing `role="menuitemradio"`, NOT the system's
             * `DropdownMenuRadioItem`.
             *
             * These rows navigate as well as select — picking one switches the
             * whole workspace scope — so a real Radix RadioGroup would own the
             * value and fight the router for it. The check column is reserved
             * whether or not the row is current, so labels do not shift by an
             * icon's width as the selection moves.
             */
            <DropdownMenuItem
              key={option.id}
              role="menuitemradio"
              aria-checked={option.id === selectedId}
              onSelect={() => onSelect(option.id)}
            >
              <CheckIcon
                size={14}
                className={cn('shrink-0', option.id !== selectedId && 'invisible')}
              />
              {option.dotClassName ? (
                <span
                  aria-hidden
                  className={cn('size-2 shrink-0 rounded-full', option.dotClassName)}
                />
              ) : (
                Icon && <Icon size={15} className="text-muted-foreground shrink-0" />
              )}
              <span className="truncate">{option.label}</span>
              {option.meta && (
                <span className="text-muted-foreground ml-auto shrink-0 pl-2 text-[11.5px]">
                  {option.meta}
                </span>
              )}
            </DropdownMenuItem>
          ))}
          {options.length === 0 && (
            <p className="text-muted-foreground px-2 py-2 text-[13px]">
              No {kind.toLowerCase()}s yet.
            </p>
          )}
          {overflowing && (
            <DropdownMenuItem
              className="text-muted-foreground"
              onSelect={() => setSwitcherOpen(true)}
            >
              {/* Aligned to the option labels above, past the reserved check
                  column and the leading mark, so it reads as the end of that
                  list rather than as another option in it. */}
              <span className="pl-[calc(14px+15px+0.875rem)]">Browse all {options.length}…</span>
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!onCreate}
            onSelect={onCreate}
            title={onCreate ? undefined : createDisabledReason}
          >
            <PlusIcon size={15} className="shrink-0" />
            {createLabel}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ScopeSwitcherDialog
        open={switcherOpen}
        onOpenChange={setSwitcherOpen}
        title={`Switch ${kind.toLowerCase()}`}
        options={options}
        selectedId={selectedId}
        onSelect={onSelect}
      />
    </>
  );
}

/** Shared by the pickers' trigger row: the thin "/" that separates scope levels. */
export function ScopeSeparator(): ReactNode {
  return (
    <span aria-hidden className="text-border select-none">
      /
    </span>
  );
}
