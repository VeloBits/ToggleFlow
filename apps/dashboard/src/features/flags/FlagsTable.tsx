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
 */
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

import { FLAG_COLUMNS, type CellContext, type FlagRow } from './flag-columns';
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
  return (
    <div className="hidden md:block">
      <Table aria-label="Flags">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {FLAG_COLUMNS.map((column) => {
              const active = column.sortKey && sort.key === column.sortKey;
              return (
                <TableHead
                  key={column.id}
                  className={cn(
                    column.width,
                    column.align === 'right' && 'text-right',
                    column.hideBelow === 'lg' && 'hidden lg:table-cell',
                  )}
                  // Announce the current sort to assistive tech rather than
                  // leaving it to the arrow glyph.
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {column.sortKey ? (
                    <button
                      type="button"
                      /*
                       * `border-0 bg-transparent p-0` is required, not tidying:
                       * styles.css's global `button { border; background; padding }`
                       * sits in Tailwind's `components` layer, so a bare <button>
                       * renders as a bordered box until a utility layer overrides
                       * it. Without these three, every column header looks like a
                       * form control.
                       */
                      className="text-muted-foreground hover:text-text flex items-center gap-1 border-0 bg-transparent p-0 font-semibold uppercase"
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
                    <span className="text-muted-foreground font-semibold uppercase">
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
            <TableRow
              key={flag.id}
              className={cn('cursor-pointer', flag.archived && 'opacity-60')}
              onClick={() => ctx.onOpen(flag)}
            >
              {FLAG_COLUMNS.map((column) => (
                <TableCell
                  key={column.id}
                  className={cn(
                    column.width,
                    column.align === 'right' && 'text-right',
                    column.hideBelow === 'lg' && 'hidden lg:table-cell',
                  )}
                  /*
                   * The interactive cells swallow the click so flipping a switch
                   * or copying a key does not also navigate. Done per column
                   * from the registry rather than inside each control, so a new
                   * interactive column cannot forget to do it.
                   */
                  onClick={column.interactive ? (event) => event.stopPropagation() : undefined}
                >
                  {column.cell(flag, ctx)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
