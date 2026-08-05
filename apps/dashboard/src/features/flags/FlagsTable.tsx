/**
 * The md-and-up layout. Its sibling `FlagsCards` renders the same columns
 * stacked; both are always mounted and Tailwind picks one at the `md`
 * breakpoint - the same breakpoint at which `Layout.tsx` turns the sidebar into
 * a drawer, so the whole chrome changes shape at once.
 *
 * Chosen over a `useMediaQuery` hook because a hook makes the render path depend
 * on happy-dom's `matchMedia` fidelity: whichever branch its default picks is
 * the only branch the suite would ever exercise, and the other would rot
 * unnoticed.
 *
 * ## What this file decides and what the registry decides
 *
 * Nothing here knows what a column contains. Widths, breakpoints, head styling
 * and row padding all arrive from `flag-columns.tsx` so that `FlagsSkeleton` can
 * draw the identical header from the identical strings. What is left is the two
 * behaviours that belong to a table rather than to a column: the sort control on
 * a head, and the click that opens a row.
 */
import { memo } from 'react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowDownIcon, ArrowUpDownIcon } from '@/ui/icons';
import { cn } from '@/ui/cn';

import {
  columnClass,
  HEAD_CLASS,
  ROW_CLASS,
  visibleColumns,
  type CellContext,
  type FlagColumn,
  type FlagRow,
} from './flag-columns';
import { nextSort, type FlagSort } from './flags-sort';

export function FlagsTable({
  flags,
  sort,
  onSortChange,
  ctx,
}: {
  flags: FlagRow[];
  sort: FlagSort;
  onSortChange: (sort: FlagSort) => void;
  ctx: CellContext;
}) {
  const columns = visibleColumns(ctx);

  return (
    <div className="hidden md:block">
      <Table aria-label="Flags">
        {/* Tinted, so the header reads as chrome rather than as a first row. */}
        <TableHeader className="bg-bg2">
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => {
              const active = column.sortKey && sort.key === column.sortKey;
              return (
                <TableHead
                  key={column.id}
                  className={cn(HEAD_CLASS, columnClass(column))}
                  // Announce the current sort to assistive tech rather than
                  // leaving it to the arrow glyph.
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {column.headerCell ? (
                    // The registry may own its own header - the select column's
                    // tri-state box, which has nothing to sort by.
                    column.headerCell(ctx)
                  ) : column.sortKey ? (
                    <button
                      type="button"
                      /*
                       * `border-0 bg-transparent p-0` is required, not tidying:
                       * styles.css's global `button { border; background; padding }`
                       * sits in Tailwind's `components` layer, so a bare <button>
                       * renders as a bordered box until a utility layer overrides
                       * it. Without these three, every column header looks like a
                       * form control.
                       *
                       * The size, colour and letter-spacing are inherited from
                       * the <th> instead of repeated, so a sortable head and an
                       * unsortable one cannot drift apart.
                       */
                      className="hover:text-text flex items-center gap-1 border-0 bg-transparent p-0 font-semibold uppercase"
                      onClick={() => onSortChange(nextSort(sort, column.sortKey!))}
                    >
                      {column.header}
                      {active ? (
                        <ArrowDownIcon
                          size={12}
                          className={cn('transition-transform', sort.dir === 'asc' && 'rotate-180')}
                        />
                      ) : (
                        <ArrowUpDownIcon size={12} className="opacity-40" />
                      )}
                    </button>
                  ) : (
                    // Unsortable columns still need their name available to a
                    // screen reader; the actions column has none, and an empty
                    // header cell is the right answer there.
                    <span>{column.header}</span>
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {flags.map((flag) => (
            <FlagsTableRow
              key={flag.id}
              flag={flag}
              columns={columns}
              ctx={ctx}
              selected={ctx.selection?.isSelected(flag.id) ?? false}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function FlagsTableRowBase({
  flag,
  columns,
  ctx,
  selected,
}: {
  flag: FlagRow;
  columns: FlagColumn[];
  ctx: CellContext;
  selected: boolean;
}) {
  return (
    <TableRow
      className={cn('cursor-pointer', ROW_CLASS, flag.archived && 'opacity-60')}
      /*
       * Reuses table.tsx's own `data-[state=selected]:bg-muted` rather than
       * adding a second class for the same idea - so a selected flag row and a
       * selected row anywhere else this primitive is used tint identically.
       */
      data-state={selected ? 'selected' : undefined}
      onClick={() => ctx.onOpen(flag)}
    >
      {columns.map((column) => (
        <TableCell
          key={column.id}
          className={columnClass(column)}
          /*
           * The interactive cells swallow the click so flipping a switch,
           * ticking a box or copying a key does not also navigate. Done per
           * column from the registry rather than inside each control, so a new
           * interactive column cannot forget to do it.
           */
          onClick={column.interactive ? (event) => event.stopPropagation() : undefined}
        >
          {column.cell(flag, ctx)}
        </TableCell>
      ))}
    </TableRow>
  );
}

/**
 * Memoised for the same reason `AuditTableRow` is: the toolbar's search box
 * re-derives the filtered list on every keystroke, and this page windows a
 * couple of thousand rows down to a hundred (see `FlagsPage`'s docblock on
 * scale). Without the memo each character re-renders all hundred rows, every one
 * of which formats a timestamp and mounts a switch, a tooltip and a Radix menu.
 *
 * It only bites while `ctx` keeps its identity between renders, and `ctx` is
 * built by `FlagsPage`, so the win is contingent on that object being memoised
 * there. This file cannot enforce it; what it can do is not be the reason the
 * comparison fails.
 */
const FlagsTableRow = memo(FlagsTableRowBase);
