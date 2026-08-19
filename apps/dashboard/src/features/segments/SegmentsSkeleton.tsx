/**
 * The loading state, shaped like the table it becomes - see `FlagsSkeleton` for
 * why a shaped skeleton rather than a spinner.
 *
 * The headings and their breakpoints are declared once here and read by both the
 * skeleton and nothing else, because this table's columns are fixed rather than
 * registry-driven (no per-role select column, no sorting), so the registry
 * indirection `FLAG_COLUMNS` needs would be structure without a second reader.
 * The one thing that must not drift is the heading list, which is why it sits
 * beside the widths rather than being retyped inside the loop.
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

const HEAD_CLASS = 'text-muted-foreground text-[11px] font-semibold uppercase tracking-wide';
const ROWS = 6;

const COLUMNS: { header: string; className?: string; bar: string }[] = [
  { header: 'Name', bar: 'w-40' },
  { header: 'Key', bar: 'w-24' },
  { header: 'Conditions', className: 'hidden lg:table-cell', bar: 'w-52' },
  { header: 'Usage', bar: 'w-14' },
  { header: 'Last modified', className: 'hidden xl:table-cell', bar: 'w-20' },
];

export function SegmentsSkeleton() {
  return (
    <>
      <div className="hidden md:block" aria-hidden>
        <Table>
          <TableHeader className="bg-bg2">
            <TableRow className="hover:bg-transparent">
              {COLUMNS.map((column) => (
                <TableHead key={column.header} className={cn(HEAD_CLASS, column.className)}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: ROWS }, (_, row) => (
              <TableRow key={row} className="hover:bg-transparent">
                {COLUMNS.map((column) => (
                  <TableCell key={column.header} className={cn('py-2.5', column.className)}>
                    <Skeleton className={cn('h-4', column.bar)} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-2 p-3 md:hidden" aria-hidden>
        {Array.from({ length: 3 }, (_, card) => (
          <Skeleton key={card} className="h-24 w-full" />
        ))}
      </div>
      <span role="status" className="sr-only">
        Loading segments…
      </span>
    </>
  );
}
