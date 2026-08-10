/**
 * The loading state, shaped like the table it becomes.
 *
 * A skeleton in the table's own shape rather than a spinner, because the shape
 * is already known: the header row, the column widths and the row height are all
 * fixed before the data arrives. Showing them means the content appears in place
 * instead of shoving a spinner aside, which is the difference between "loading"
 * and "flickering".
 *
 * Every string that decides that shape - the headings, the widths, the
 * breakpoints, the head styling, the row padding and each placeholder bar's
 * width - is read from `FLAG_COLUMNS`, following `AuditSkeleton`. A parallel
 * array of widths maintained by hand here is how the placeholder ends up a
 * column behind the real header and the whole table jumps when the data lands.
 *
 * Eight rows because that is roughly a viewport at this row height - enough to
 * fill the space, not so many that the page scrolls to reveal fake content.
 */
import {
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@velobits-dev/ui';
import { cn } from '@/ui/cn';

import { columnClass, HEAD_CLASS, ROW_CLASS, visibleColumns } from './flag-columns';

const ROWS = 8;

/**
 * No `ctx` exists yet at this point, so the select column is absent - which is
 * also the right answer: nothing can be selected until there are rows to select.
 */
const COLUMNS = visibleColumns({});

export function FlagsSkeleton() {
  return (
    <>
      <div className="hidden md:block" aria-hidden>
        {/* `surface="none"` for the same reason `FlagsTable` passes it: this sits
            inside the page's Card, and a glass wrapper inside a glass wrapper
            cancels. The skeleton must sit on the surface the table will. */}
        <Table surface="none">
          <TableHeader className="bg-bg2">
            <TableRow className="hover:bg-transparent">
              {COLUMNS.map((column) => (
                <TableHead key={column.id} className={cn(HEAD_CLASS, columnClass(column))}>
                  {/* The registry's `hideHeader` columns paint nothing here
                      either, or the loading state would show two headings the
                      real table does not. The whole block is `aria-hidden`, so
                      unlike the table this needs no `sr-only` fallback. */}
                  {column.hideHeader ? null : column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: ROWS }, (_, row) => (
              <TableRow key={row} className={cn('hover:bg-transparent', ROW_CLASS)}>
                {COLUMNS.map((column) => (
                  <TableCell key={column.id} className={columnClass(column)}>
                    <Skeleton className={cn('h-4', column.skeleton)} />
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
