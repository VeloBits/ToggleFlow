/**
 * The below-md layout: one card per flag, rendering the SAME column definitions
 * as `FlagsTable` in a stacked, labelled form.
 *
 * Labelled rather than a bare stack, because once the header row is gone a
 * column of unlabelled values is a guessing game - the `Type` badge and the
 * `Current value` for a string flag look alike at a glance. This is a
 * description list, which is what a table row without its header actually is.
 */
import { Card } from '@/components/ui/card';
import { cn } from '@/ui/cn';

import { CARD_DETAIL_COLUMNS, FLAG_COLUMNS, type CellContext, type FlagRow } from './flag-columns';

const NAME_COLUMN = FLAG_COLUMNS.find((column) => column.id === 'name')!;
const STATUS_COLUMN = FLAG_COLUMNS.find((column) => column.id === 'status')!;
const ACTIONS_COLUMN = FLAG_COLUMNS.find((column) => column.id === 'actions')!;

export function FlagsCards({ flags, ctx }: { flags: FlagRow[]; ctx: CellContext }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-3 md:hidden" aria-label="Flags (compact)">
      {flags.map((flag) => (
        <li key={flag.id}>
          <Card
            className={cn('cursor-pointer gap-0 p-3', flag.archived && 'opacity-60')}
            onClick={() => ctx.onOpen(flag)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">{NAME_COLUMN.cell(flag, ctx)}</div>
              <div className="flex shrink-0 items-center gap-1">
                {STATUS_COLUMN.cell(flag, ctx)}
                <span onClick={(event) => event.stopPropagation()}>
                  {ACTIONS_COLUMN.cell(flag, ctx)}
                </span>
              </div>
            </div>
            <dl className="border-border mt-2.5 m-0 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 border-t pt-2.5">
              {CARD_DETAIL_COLUMNS.map((column) => (
                <div key={column.id} className="col-span-2 grid grid-cols-subgrid items-center">
                  <dt className="text-muted-foreground text-[11px] font-semibold uppercase">
                    {column.header}
                  </dt>
                  <dd
                    className="m-0 min-w-0"
                    onClick={column.interactive ? (event) => event.stopPropagation() : undefined}
                  >
                    {column.cell(flag, ctx)}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        </li>
      ))}
    </ul>
  );
}
