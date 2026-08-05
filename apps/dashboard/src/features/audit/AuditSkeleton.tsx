/**
 * The loading state, shaped like the table it becomes.
 *
 * Header and column widths come from `AUDIT_COLUMNS` rather than a second copy,
 * so the rows cannot jump sideways when the data lands. `aria-hidden` on the
 * placeholder plus one polite `role="status"` line: eight rows of meaningless
 * boxes announced individually is noise, and the one thing a screen reader user
 * needs to know is that something is loading.
 */
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/ui/cn';

import { AUDIT_COLUMNS, AuditTableHead } from './AuditTable';

export function AuditSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <>
      <div aria-hidden className="hidden md:block">
        <Table>
          <AuditTableHead />
          <TableBody>
            {Array.from({ length: rows }, (_, row) => (
              <TableRow key={row} className="hover:bg-transparent [&>td]:py-2.5">
                {AUDIT_COLUMNS.map((column) => (
                  <TableCell
                    key={column.key}
                    className={cn(column.width, column.lgOnly && 'hidden lg:table-cell')}
                  >
                    <Skeleton className={cn('h-4', column.skeleton)} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div aria-hidden className="flex flex-col gap-3 p-4 md:hidden">
        {Array.from({ length: 4 }, (_, row) => (
          <Skeleton key={row} className="h-16 w-full" />
        ))}
      </div>

      <span role="status" className="sr-only">
        Loading the audit log…
      </span>
    </>
  );
}
