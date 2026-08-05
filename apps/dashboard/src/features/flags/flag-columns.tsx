/**
 * The column registry - defined once, rendered by both the table (md and up)
 * and the cards (below md).
 *
 * Both layouts are always in the DOM and CSS picks one, so a column that
 * existed in one and not the other would be an invisible inconsistency: a field
 * present on desktop and missing on a phone, with nothing to catch it. Driving
 * both from one array makes that impossible rather than merely unlikely.
 *
 * The cost of always rendering both is duplicated text nodes, which is why
 * every list assertion in the suite scopes itself to one layout - see the
 * convention note at the top of `flags-page.test.tsx`.
 *
 * ## One row, one line
 *
 * Every cell here renders a single line, and the entry carries everything the
 * three consumers need to agree on: the width, the breakpoint, the head styling
 * and the skeleton's placeholder bar. That is the arrangement `AUDIT_COLUMNS`
 * uses, adopted for the same reason - the loading state cannot drift from the
 * header it becomes, because there is no second copy of the list to drift from.
 *
 * `name` used to stack name over description over tag badges, which made fifty
 * rows a hundred and fifty lines tall and pushed the footer below the fold on a
 * laptop. The description is now an inline continuation of the name and the tags
 * have a column of their own.
 */
import type { ReactNode } from 'react';

import type { JsonValue } from '@toggleflow/engine';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/ui/cn';
import { CopyIcon } from '@/ui/icons';
import { relativeTime } from '@/ui/relative-time';
import type { Flag } from '@/api/client';

import type { FlagSelection } from './flag-selection';
import { FlagStatusBadge } from './FlagStatusBadge';
import { FlagTypeBadge } from './FlagTypeBadge';
import { FlagValueCell } from './FlagValueCell';
import { FlagRowActions } from './FlagRowActions';
import type { SortKey } from './flags-sort';

/**
 * A list row: the per-environment flag state, joined with the two fields that
 * live on the project-scoped definition rather than on the state.
 *
 * Declared here because this is where the columns that render them are defined,
 * and it keeps the join's shape next to its only consumer. `Flag` itself stays
 * exactly the API's per-environment shape - widening it would let a page forget
 * the join and still typecheck.
 */
export interface FlagRow extends Flag {
  tags: string[];
  description: string | null;
}

export interface CellContext {
  canEdit: boolean;
  canDelete: boolean;
  /** True on production, where a value change asks for a second gesture. */
  requireConfirm: boolean;
  /**
   * Present when bulk selection is active, absent otherwise - and absent leaves
   * the list exactly as it was, because the select column renders nothing
   * without it. That is how a viewer, who can run none of the bulk actions,
   * never sees a checkbox they cannot use.
   *
   * The contract lives in `flag-selection.ts`; the column that renders it is
   * `FLAG_COLUMNS`' first entry.
   */
  selection?: FlagSelection;
  onCommit: (flag: FlagRow, patch: { enabled?: boolean; value?: JsonValue }) => void;
  onCopyKey: (flag: FlagRow) => void;
  onEdit: (flag: FlagRow) => void;
  onArchive: (flag: FlagRow, archived: boolean) => void;
  onDelete: (flag: FlagRow) => void;
  onOpen: (flag: FlagRow) => void;
}

export interface FlagColumn {
  id: 'select' | 'status' | 'name' | 'key' | 'type' | 'value' | 'tags' | 'updatedAt' | 'actions';
  header: string;
  /** Absent = not sortable. */
  sortKey?: SortKey;
  /** Dropped from the table below this width; the cards show everything. */
  hideBelow?: 'lg' | 'xl';
  align?: 'right';
  /** Column width as a Tailwind class, so the layout does not reflow per page. */
  width?: string;
  /**
   * The placeholder bar `FlagsSkeleton` draws for this column, so the loading
   * state has the shape of the content rather than of a progress bar. Required,
   * not optional: a column that forgets it is a column whose skeleton silently
   * defaults to the wrong width.
   */
  skeleton: string;
  /**
   * True when a click inside must not bubble to the row's navigate handler -
   * set for the interactive cells. Without it, flipping a switch also opens the
   * detail page.
   */
  interactive?: boolean;
  /**
   * Replaces the header's sort button or plain label. Only the select column
   * needs it, and it needs `ctx` because its tri-state comes from the selection
   * rather than from anything about the column itself.
   */
  headerCell?: (ctx: CellContext) => ReactNode;
  cell: (flag: FlagRow, ctx: CellContext) => ReactNode;
}

/**
 * Tailwind cannot see an interpolated breakpoint, so `hidden ${bp}:table-cell`
 * would compile to nothing. A map of the two literal strings is the whole
 * reason this exists.
 */
const HIDE_BELOW: Record<NonNullable<FlagColumn['hideBelow']>, string> = {
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
};

/**
 * Width, alignment and breakpoint for one column.
 *
 * Exported because the header, the body and the skeleton all need the identical
 * string: three hand-written copies of it is a skeleton that jumps sideways when
 * the data lands, which is exactly what this indirection buys out.
 */
export function columnClass(column: FlagColumn): string {
  return cn(
    column.width,
    column.align === 'right' && 'text-right',
    column.hideBelow && HIDE_BELOW[column.hideBelow],
  );
}

/**
 * The head's own styling - quieter and smaller than shadcn's `TableHead`
 * default of `text-foreground font-medium`, which on a list this dense is
 * nearly as loud as the data underneath it. Matches `AUDIT_COLUMNS`' header and
 * the legacy `table.data th` rule in styles.css, so the two tables in the app
 * read as one table.
 */
export const HEAD_CLASS =
  'text-muted-foreground h-9 text-[11.5px] font-semibold tracking-[0.03em] uppercase';

/** Row padding, shared with the skeleton so its eight rows are the real height. */
export const ROW_CLASS = '[&>td]:py-2.5';

/** Two badges is what fits on one line at the Tags width; the rest become a count. */
const TAG_LIMIT = 2;

export const FLAG_COLUMNS: FlagColumn[] = [
  /*
   * Bulk selection. `ctx.selection!` in both renderers is the invariant, not
   * optimism: `visibleColumns` drops this entry when there is no selection, so
   * neither function can run without one. A `?.` guard here would add a branch
   * that cannot be false - untestable by construction - and would turn a wiring
   * mistake into a silently empty gutter instead of a crash in a test.
   */
  {
    id: 'select',
    header: '',
    // Fixed and narrow: a flexible select column would shift every other one
    // sideways the moment bulk mode turned on.
    width: 'w-10',
    skeleton: 'w-4',
    interactive: true,
    headerCell: (ctx) => (
      <Checkbox
        checked={ctx.selection!.someSelected ? 'indeterminate' : ctx.selection!.allSelected}
        onCheckedChange={ctx.selection!.toggleAll}
        aria-label="Select all flags on this page"
      />
    ),
    cell: (flag, ctx) => (
      <Checkbox
        checked={ctx.selection!.isSelected(flag.id)}
        onCheckedChange={() => ctx.selection!.toggle(flag.id)}
        // The key, as on every other per-row control here: a column of boxes all
        // labelled "Select" is unusable with a screen reader.
        aria-label={`Select ${flag.key}`}
      />
    ),
  },
  {
    id: 'status',
    header: 'Status',
    sortKey: 'status',
    width: 'w-28',
    skeleton: 'w-14',
    cell: (flag) => <FlagStatusBadge flag={flag} />,
  },
  {
    id: 'name',
    header: 'Flag',
    sortKey: 'name',
    // No width: this is the column that absorbs whatever the fixed ones leave.
    skeleton: 'w-48',
    cell: (flag) => (
      /*
       * One line, not three. The description earns its place in the list - it is
       * how two similarly named flags are told apart - but it is a continuation
       * of the name rather than a second line under it.
       *
       * Truncating the pair as one run, instead of giving each half its own
       * `truncate` in a flex box, is deliberate: the name is always drawn in
       * full first and the description is what runs out of room, which is the
       * right order of importance. Flex would instead shrink both in proportion
       * to their content and clip the name while space remained.
       */
      <div className="min-w-0 truncate" title={flagTitle(flag)}>
        <span className="text-text font-semibold">{flag.name}</span>
        {flag.description && (
          <>
            <span aria-hidden className="text-muted-foreground/50 px-1.5">
              ·
            </span>
            <span className="text-muted-foreground text-[12px]">{flag.description}</span>
          </>
        )}
      </div>
    ),
  },
  {
    id: 'key',
    header: 'Key',
    sortKey: 'key',
    width: 'w-52',
    skeleton: 'w-32',
    interactive: true,
    cell: (flag, ctx) => (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground -mx-2 max-w-full justify-start gap-1.5 font-mono text-[12.5px] font-normal"
            aria-label={`Copy key ${flag.key}`}
            onClick={() => ctx.onCopyKey(flag)}
          >
            <span className="truncate">{flag.key}</span>
            <CopyIcon size={12} className="shrink-0 opacity-60" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Copy this key for your SDK call</TooltipContent>
      </Tooltip>
    ),
  },
  {
    id: 'type',
    header: 'Type',
    sortKey: 'type',
    hideBelow: 'lg',
    width: 'w-32',
    skeleton: 'w-16',
    cell: (flag) => <FlagTypeBadge valueType={flag.valueType} />,
  },
  {
    id: 'value',
    header: 'Current value',
    // Not sortable: the values are booleans, free text and enum members in the
    // same column, so any single ordering would be arbitrary rather than useful.
    width: 'w-56',
    skeleton: 'w-24',
    interactive: true,
    cell: (flag, ctx) => (
      <FlagValueCell
        flag={flag}
        canEdit={ctx.canEdit}
        requireConfirm={ctx.requireConfirm}
        onCommit={(patch) => ctx.onCommit(flag, patch)}
      />
    ),
  },
  {
    id: 'tags',
    header: 'Tags',
    // Not sortable: a row carries several, so sorting by "tags" would mean
    // sorting by an arbitrary one of them.
    //
    // Last of the optional columns to survive a narrowing viewport - a tag is
    // how a list is navigated, not how a flag's state is read, so it yields
    // before Type and Updated do.
    hideBelow: 'xl',
    width: 'w-36',
    skeleton: 'w-20',
    cell: (flag) => <FlagTags tags={flag.tags} />,
  },
  {
    id: 'updatedAt',
    header: 'Updated',
    sortKey: 'updatedAt',
    hideBelow: 'lg',
    width: 'w-28',
    skeleton: 'w-16',
    cell: (flag) => (
      // Relative for scanning, absolute in the title for the moment it matters -
      // which during an incident is every time. `tabular-nums` so a column of
      // them does not jitter as the digits change width.
      <span
        className="text-muted-foreground text-[12.5px] whitespace-nowrap tabular-nums"
        title={new Date(flag.updatedAt).toLocaleString()}
      >
        {relativeTime(flag.updatedAt)}
      </span>
    ),
  },
  {
    id: 'actions',
    header: '',
    align: 'right',
    width: 'w-10',
    skeleton: 'w-4',
    interactive: true,
    cell: (flag, ctx) => <FlagRowActions flag={flag} ctx={ctx} />,
  },
];

const WITHOUT_SELECT = FLAG_COLUMNS.filter((column) => column.id !== 'select');

/**
 * The columns to render for one `ctx`.
 *
 * Filtered per render rather than having the select column emit an empty cell,
 * because a 40px gutter down the left of the list is a cost paid by everybody
 * who is not selecting anything. Viewers never turn selection on at all.
 *
 * Both results are module constants, so the returned identity is stable across
 * renders and the memoised row in `FlagsTable` can still compare equal.
 */
export function visibleColumns(ctx: Pick<CellContext, 'selection'>): FlagColumn[] {
  return ctx.selection ? FLAG_COLUMNS : WITHOUT_SELECT;
}

/**
 * The cards omit the redundant ones: name and status are already the header, and
 * select sits beside them there rather than in the labelled list.
 */
export const CARD_DETAIL_COLUMNS = FLAG_COLUMNS.filter((column) =>
  ['key', 'type', 'value', 'tags', 'updatedAt'].includes(column.id),
);

/** Both halves of the truncated run, for the cell's `title`. */
const flagTitle = (flag: FlagRow) =>
  flag.description ? `${flag.name} — ${flag.description}` : flag.name;

function FlagTags({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    // An em-dash rather than nothing. In the table either would do; on a card
    // this column is a labelled row, and a label with empty space after it reads
    // as a failed render.
    return <span className="text-muted-foreground/60">—</span>;
  }

  const overflow = tags.length - TAG_LIMIT;
  return (
    <span className="flex min-w-0 items-center gap-1">
      {tags.slice(0, TAG_LIMIT).map((tag) => (
        <Badge key={tag} variant="secondary" className="max-w-24 font-normal" title={tag}>
          <span className="truncate">{tag}</span>
        </Badge>
      ))}
      {overflow > 0 && (
        // The count carries the whole list, so a capped cell never hides a tag
        // without offering a way to read it.
        <span
          className="text-muted-foreground shrink-0 text-[11.5px] tabular-nums"
          title={tags.join(', ')}
        >
          +{overflow}
        </span>
      )}
    </span>
  );
}
