/**
 * The loading state.
 *
 * A skeleton in the table's own shape rather than a spinner, because the shape
 * is already known: the header row, the column widths and the row height are all
 * fixed before the data arrives. Showing them means the content appears in place
 * instead of shoving a spinner aside, which is the difference between "loading"
 * and "flickering".
 *
 * Eight rows because that is roughly a viewport at this row height - enough to
 * fill the space, not so many that the page scrolls to reveal fake content.
 */
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/ui/cn';

import { FLAG_COLUMNS } from './flag-columns';

const ROWS = 8;

/** Varied widths so the block reads as text rather than as a progress bar. */
const WIDTHS = ['w-16', 'w-40', 'w-28', 'w-20', 'w-24', 'w-16', 'w-8'];

export function FlagsSkeleton() {
  return (
    <>
      <div className="hidden md:block" aria-hidden>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {FLAG_COLUMNS.map((column) => (
                <TableHead
                  key={column.id}
                  className={cn(column.width, column.hideBelow === 'lg' && 'hidden lg:table-cell')}
                >
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: ROWS }, (_, row) => (
              <TableRow key={row} className="hover:bg-transparent">
                {FLAG_COLUMNS.map((column, index) => (
                  <TableCell
                    key={column.id}
                    className={cn(
                      column.width,
                      column.hideBelow === 'lg' && 'hidden lg:table-cell',
                    )}
                  >
                    <Skeleton className={cn('h-4', WIDTHS[index] ?? 'w-20')} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-2 p-3 md:hidden" aria-hidden>
        {Array.from({ length: 3 }, (_, card) => (
          <Skeleton key={card} className="h-28 w-full" />
        ))}
      </div>
      {/* One polite announcement for assistive tech; the visual skeleton above
          is decorative and hidden from it. */}
      <span role="status" className="sr-only">
        Loading flags…
      </span>
    </>
  );
}
