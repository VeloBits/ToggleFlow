/**
 * The below-md layout: one card per flag, rendering the SAME column definitions
 * as `FlagsTable` in a stacked, labelled form.
 *
 * Labelled rather than a bare stack, because once the header row is gone a
 * column of unlabelled values is a guessing game - the `Type` badge and the
 * `Current value` for a string flag look alike at a glance. This is a
 * description list, which is what a table row without its header actually is.
 *
 * The card's own header is assembled by hand from four named columns rather than
 * driven by `visibleColumns`, because the arrangement is not a list: the select
 * box, the name and the status sit on one line in that order regardless of where
 * the registry puts them. The detail rows below it are the registry's order.
 */
import { Card } from '@/components/ui/card';
import { cn } from '@/ui/cn';

import { CARD_DETAIL_COLUMNS, FLAG_COLUMNS, type CellContext, type FlagRow } from './flag-columns';

const SELECT_COLUMN = FLAG_COLUMNS.find((column) => column.id === 'select')!;
const NAME_COLUMN = FLAG_COLUMNS.find((column) => column.id === 'name')!;
const STATUS_COLUMN = FLAG_COLUMNS.find((column) => column.id === 'status')!;
const ACTIONS_COLUMN = FLAG_COLUMNS.find((column) => column.id === 'actions')!;

export function FlagsCards({ flags, ctx }: { flags: FlagRow[]; ctx: CellContext }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-3 md:hidden" aria-label="Flags (compact)">
      {flags.map((flag) => {
        const selected = ctx.selection?.isSelected(flag.id) ?? false;
        return (
          <li key={flag.id}>
            <Card
              className={cn(
                'cursor-pointer gap-0 p-3',
                flag.archived && 'opacity-60',
                /*
                 * A ring as well as a tint, where the table row makes do with
                 * the tint alone: a card already sits on its own raised
                 * background, and `bg-muted` against `bg-card` is a difference
                 * of a few percent luminance that vanishes in sunlight on a
                 * phone. The ring is the part that survives.
                 */
                selected && 'ring-primary/50 bg-muted/40 ring-2',
              )}
              onClick={() => ctx.onOpen(flag)}
            >
              <div className="flex items-start justify-between gap-2">
                {/* Same condition `visibleColumns` applies in the table, spelled
                    out because this header is hand-assembled. */}
                {ctx.selection && (
                  <span className="pt-0.5" onClick={(event) => event.stopPropagation()}>
                    {SELECT_COLUMN.cell(flag, ctx)}
                  </span>
                )}
                <div className="min-w-0 flex-1">{NAME_COLUMN.cell(flag, ctx)}</div>
                <div className="flex shrink-0 items-center gap-1">
                  {STATUS_COLUMN.cell(flag, ctx)}
                  <span onClick={(event) => event.stopPropagation()}>
                    {ACTIONS_COLUMN.cell(flag, ctx)}
                  </span>
                </div>
              </div>
              <dl className="border-border m-0 mt-2.5 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 border-t pt-2.5">
                {CARD_DETAIL_COLUMNS.map((column) => (
                  <div key={column.id} className="col-span-2 grid grid-cols-subgrid items-center">
                    <dt className="text-muted-foreground text-[11px] font-semibold tracking-[0.03em] uppercase">
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
        );
      })}
    </ul>
  );
}
