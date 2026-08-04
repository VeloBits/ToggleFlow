/**
 * The per-row overflow menu.
 *
 * Uses `src/ui/menu.tsx` (the existing Radix dropdown) rather than a generated
 * shadcn one - it already encodes the `data-[highlighted]` styling that makes
 * keyboard and pointer navigation look identical, which a fresh generate would
 * discard.
 *
 * "Edit definition" opens a Dialog rather than expanding in place, because a
 * Radix menu cannot host a text input: `onOpenAutoFocus` is private on menu
 * content, so a field inside one means fighting the primitive.
 *
 * Archive and Delete are two-step. Not because a mis-click is likely, but
 * because both are visible to every SDK consumer within the publish debounce,
 * and a menu item sits one pixel from "Open detail".
 */
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/ui/menu';
import {
  ArchiveIcon,
  CopyIcon,
  MoreHorizontalIcon,
  PencilIcon,
  ChevronRightIcon,
  TrashIcon,
} from '@/ui/icons';

import type { CellContext, FlagRow } from './flag-columns';

export function FlagRowActions({ flag, ctx }: { flag: FlagRow; ctx: CellContext }) {
  /*
   * Arming lives here rather than in a shared ConfirmButton because a menu item
   * that changes its own label in place keeps the pointer over the same target -
   * whereas closing the menu to show a confirm elsewhere loses the gesture.
   */
  const [armed, setArmed] = useState<'archive' | 'delete' | null>(null);

  const closeAndReset = (open: boolean) => {
    if (!open) setArmed(null);
  };

  return (
    <Menu onOpenChange={closeAndReset}>
      <MenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
          // The key is in the name because a column of identical "Actions"
          // buttons is unusable with a screen reader, and it is how the tests
          // reach a specific row's menu.
          aria-label={`Actions for ${flag.key}`}
        >
          <MoreHorizontalIcon size={15} />
        </Button>
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem onSelect={() => ctx.onOpen(flag)}>
          <ChevronRightIcon size={14} /> Open detail
        </MenuItem>
        <MenuItem onSelect={() => ctx.onCopyKey(flag)}>
          <CopyIcon size={14} /> Copy key
        </MenuItem>
        {ctx.canEdit && (
          <MenuItem onSelect={() => ctx.onEdit(flag)}>
            <PencilIcon size={14} /> Edit definition
          </MenuItem>
        )}
        {ctx.canEdit && (
          <>
            <MenuSeparator />
            <MenuItem
              // Keep the menu open on the arming click, close it on the firing
              // one, so the two steps are one continuous interaction.
              onSelect={(event) => {
                if (armed !== 'archive') {
                  event.preventDefault();
                  setArmed('archive');
                  return;
                }
                ctx.onArchive(flag, !flag.archived);
              }}
            >
              <ArchiveIcon size={14} />
              {armed === 'archive'
                ? `Confirm ${flag.archived ? 'restore' : 'archive'}?`
                : flag.archived
                  ? 'Restore flag'
                  : 'Archive flag'}
            </MenuItem>
          </>
        )}
        {ctx.canDelete && (
          <MenuItem
            className="text-destructive data-[highlighted]:text-destructive"
            onSelect={(event) => {
              if (armed !== 'delete') {
                event.preventDefault();
                setArmed('delete');
                return;
              }
              ctx.onDelete(flag);
            }}
          >
            <TrashIcon size={14} />
            {armed === 'delete' ? 'Confirm delete — this cannot be undone' : 'Delete flag'}
          </MenuItem>
        )}
      </MenuContent>
    </Menu>
  );
}
