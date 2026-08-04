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
 */
import type { ReactNode } from 'react';

import type { JsonValue } from '@toggleflow/engine';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CopyIcon } from '@/ui/icons';
import { relativeTime } from '@/ui/relative-time';
import type { Flag } from '@/api/client';

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
  onCommit: (flag: FlagRow, patch: { enabled?: boolean; value?: JsonValue }) => void;
  onCopyKey: (flag: FlagRow) => void;
  onEdit: (flag: FlagRow) => void;
  onArchive: (flag: FlagRow, archived: boolean) => void;
  onDelete: (flag: FlagRow) => void;
  onOpen: (flag: FlagRow) => void;
}

export interface FlagColumn {
  id: 'name' | 'key' | 'type' | 'value' | 'status' | 'updatedAt' | 'actions';
  header: string;
  /** Absent = not sortable. Value is not: it is a different type per row. */
  sortKey?: SortKey;
  /** Dropped from the table below this width; the cards show everything. */
  hideBelow?: 'lg';
  align?: 'right';
  /** Column width as a Tailwind class, so the layout does not reflow per page. */
  width?: string;
  /**
   * True when a click inside must not bubble to the row's navigate handler -
   * set for the interactive cells. Without it, flipping a switch also opens the
   * detail page.
   */
  interactive?: boolean;
  cell: (flag: FlagRow, ctx: CellContext) => ReactNode;
}

export const FLAG_COLUMNS: FlagColumn[] = [
  {
    id: 'status',
    header: 'Status',
    sortKey: 'status',
    width: 'w-28',
    cell: (flag) => <FlagStatusBadge flag={flag} />,
  },
  {
    id: 'name',
    header: 'Flag',
    sortKey: 'name',
    cell: (flag) => (
      <div className="min-w-0">
        <div className="text-text truncate font-semibold">{flag.name}</div>
        {flag.description && (
          <div className="text-muted-foreground truncate text-[12px]">{flag.description}</div>
        )}
        {flag.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {flag.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="font-normal">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    ),
  },
  {
    id: 'key',
    header: 'Key',
    sortKey: 'key',
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
    width: 'w-36',
    cell: (flag) => <FlagTypeBadge valueType={flag.valueType} />,
  },
  {
    id: 'value',
    header: 'Current value',
    // Not sortable: the values are booleans, free text and enum members in the
    // same column, so any single ordering would be arbitrary rather than useful.
    width: 'w-56',
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
    id: 'updatedAt',
    header: 'Updated',
    sortKey: 'updatedAt',
    hideBelow: 'lg',
    width: 'w-32',
    cell: (flag) => (
      // Relative for scanning, absolute in the title for the moment it matters -
      // which during an incident is every time.
      <span
        className="text-muted-foreground text-[12.5px]"
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
    width: 'w-12',
    interactive: true,
    cell: (flag, ctx) => <FlagRowActions flag={flag} ctx={ctx} />,
  },
];

/** The cards omit the redundant ones: name and status are already the header. */
export const CARD_DETAIL_COLUMNS = FLAG_COLUMNS.filter((column) =>
  ['key', 'type', 'value', 'updatedAt'].includes(column.id),
);
