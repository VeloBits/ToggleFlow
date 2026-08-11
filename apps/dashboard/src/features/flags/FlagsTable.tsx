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
 * ## Why this is not the design system's `DataTable`
 *
 * It nearly is, and the near-miss is worth recording so nobody re-opens it
 * cheaply. `DataTable`'s column registry was lifted from THIS file, so
 * `FlagColumn` is `DataTableColumn` plus four fields, `visibleColumns` is its
 * `visible`, and it would hand back the sort buttons, the memoised rows and the
 * keyboard row activation for free.
 *
 * One thing stops it, and it is structural rather than cosmetic:
 * **`DataTable` has no `surface` passthrough.** Its props are
 * `ComponentProps<'table'>`, so `surface` cannot be spelled, and it always
 * renders `Table`'s default glass wrapper. This table lives inside `FlagsPage`'s
 * `Card`, and the system's own `Table` docblock names that exact case - "`none`
 * leaves the wrapper bare for a table already sitting inside a Card or a Dialog
 * - because a surface inside a surface is nested glass and both layers cancel".
 * Neutralising the wrapper from `containerClassName` means fighting
 * `.glass-surface` with `!important` utilities, which is worse than owning
 * twenty lines of `<thead>`.
 *
 * The second, softer reason: `FlagsSkeleton` and `FlagsCards` read the same
 * registry, and the skeleton has to draw the identical header from the identical
 * strings. `DataTable` hardcodes its own head metric, so the skeleton's
 * `HEAD_CLASS` and the real header would become two hand-maintained copies of
 * one measurement - the drift this registry exists to prevent.
 *
 * So the table is hand-rolled, but only the markup: the `Table*` primitives, the
 * paint and every behaviour `DataTable` would have supplied - `aria-sort` on the
 * `<th>` rather than on the button, non-empty headers, click-swallowing
 * interactive cells and Enter/Space row activation - are reproduced here
 * deliberately, not left behind.
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

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@velobits-dev/ui';
import { ArrowDownIcon, ArrowUpDownIcon } from '@velobits-dev/icons';
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
      {/* The page no longer wraps this in a Card, so the table's own wrapper is
          the glass surface. `Table` never takes the blur variant — the wrapper
          is a scroll container and a live backdrop layer would re-sample on
          every scroll frame. */}
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
                  // leaving it to the arrow glyph. On the `<th>`, never on the
                  // button inside it: the attribute describes the column, and on
                  // the button it is silently ignored - the arrow still works,
                  // the announcement does not, and nothing reports a problem.
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
                       * `border-0 bg-transparent p-0` stays: Preflight resets
                       * neither a button's background nor its border, so without
                       * these three every column header renders as a bordered
                       * box. This is the case the migration contract calls out
                       * as a deliberate bare button rather than a `<Button>` -
                       * the size, colour and letter-spacing are inherited from
                       * the <th> instead of repeated, so a sortable head and an
                       * unsortable one cannot drift apart.
                       */
                      className="hover:text-fg focus-visible:ring-ring/40 flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 font-semibold uppercase outline-none focus-visible:ring-[3px]"
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
                    /*
                     * `sr-only`, never an empty `<th>`. The select and actions
                     * columns have nothing to paint up here, but a header cell
                     * with no text at all announces the whole column as
                     * nameless - and is an axe `empty-table-header` violation.
                     */
                    <span className={column.hideHeader ? 'sr-only' : undefined}>
                      {column.header}
                    </span>
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
       * Reuses table.tsx's own `data-[state=selected]` tint rather than adding a
       * second class for the same idea - so a selected flag row and a selected
       * row anywhere else this primitive is used tint identically.
       */
      data-state={selected ? 'selected' : undefined}
      /*
       * A clickable `<tr>` is mouse-only, so it also takes focus and answers
       * Enter/Space - the treatment `DataTable` gives its rows. The row is
       * *convenience*: the real keyboard route is the kebab menu's "Open
       * detail", which is why the row carries the flag's key as its name rather
       * than duplicating the whole row's text.
       *
       * The `event.target !== event.currentTarget` guard is what stops Enter
       * inside the key-copy button or the inline value input from also
       * navigating.
       */
      tabIndex={0}
      aria-label={flag.key}
      onClick={() => ctx.onOpen(flag)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        ctx.onOpen(flag);
      }}
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
