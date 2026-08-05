import type { ReactNode, SVGProps } from 'react';

export interface IconProps extends SVGProps<SVGSVGElement> {
  /** Width and height in px - icons are square. */
  size?: number | string;
}

/**
 * Stroke-based icon set (Feather/Lucide-style, 24×24 grid, currentColor) - the
 * same convention as fixmytext's `@velobits/design-system` icons, copied rather
 * than imported because that package is private and in a different workspace.
 * Icons are decorative by default (aria-hidden); pass `aria-hidden={undefined}`
 * plus an `aria-label` for semantic use.
 */
function createIcon(displayName: string, children: ReactNode) {
  function Icon({ size = 16, ...props }: IconProps) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        {children}
      </svg>
    );
  }
  Icon.displayName = displayName;
  return Icon;
}

export const MenuIcon = createIcon(
  'MenuIcon',
  <>
    <line x1="4" x2="20" y1="12" y2="12" />
    <line x1="4" x2="20" y1="6" y2="6" />
    <line x1="4" x2="20" y1="18" y2="18" />
  </>,
);

export const MoonIcon = createIcon('MoonIcon', <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />);

export const SunIcon = createIcon(
  'SunIcon',
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </>,
);

export const XIcon = createIcon(
  'XIcon',
  <>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </>,
);

export const ChevronDownIcon = createIcon('ChevronDownIcon', <path d="m6 9 6 6 6-6" />);

export const ChevronRightIcon = createIcon('ChevronRightIcon', <path d="m9 18 6-6-6-6" />);

/**
 * The affordance on a picker trigger. A lone chevron-down reads as "expand";
 * the opposed pair says "this value is one of a set you can swap between",
 * which is what the org/project/env triggers actually do.
 */
export const ChevronsUpDownIcon = createIcon(
  'ChevronsUpDownIcon',
  <>
    <path d="m7 15 5 5 5-5" />
    <path d="m7 9 5-5 5 5" />
  </>,
);

export const CheckIcon = createIcon('CheckIcon', <path d="M20 6 9 17l-5-5" />);

export const PlusIcon = createIcon(
  'PlusIcon',
  <>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </>,
);

export const ArrowUpIcon = createIcon(
  'ArrowUpIcon',
  <>
    <path d="m5 12 7-7 7 7" />
    <path d="M12 19V5" />
  </>,
);

/*
 * Below here: the landing page's feature-card icons, kept in the order the cards
 * render in GuestHomePage so a copy change that reorders the grid has an obvious
 * counterpart here. They are drawn to read at 18px, the size the cards use -
 * which is why a few depart from their Lucide originals (noted where they do).
 */

export const PowerIcon = createIcon(
  'PowerIcon',
  <>
    <path d="M12 2v10" />
    <path d="M18.4 6.6a9 9 0 1 1-12.77.04" />
  </>,
);

export const TrendingUpIcon = createIcon(
  'TrendingUpIcon',
  <>
    <path d="M16 7h6v6" />
    <path d="m22 7-8.5 8.5-5-5L2 17" />
  </>,
);

export const TargetIcon = createIcon(
  'TargetIcon',
  <>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </>,
);

/**
 * Two faders, not Lucide's three: at 18px a third track puts strokes ~2px apart
 * and the whole glyph collapses into a hatch. Round knobs also survive the size
 * better than Lucide's tick-mark handles. Track gaps are cut exactly at each
 * knob's radius so the line never appears to pass through it.
 */
export const SlidersIcon = createIcon(
  'SlidersIcon',
  <>
    <path d="M3 7h3" />
    <path d="M12 7h9" />
    <circle cx="9" cy="7" r="3" />
    <path d="M3 17h9" />
    <path d="M18 17h3" />
    <circle cx="15" cy="17" r="3" />
  </>,
);

export const GlobeIcon = createIcon(
  'GlobeIcon',
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
    <path d="M2 12h20" />
  </>,
);

export const HistoryIcon = createIcon(
  'HistoryIcon',
  <>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l4 2" />
  </>,
);

/**
 * The "Canary releases" card. This is an audience, not a rocket, because no
 * rocket survives 18px: a hull with flared fins is topologically the letter A,
 * and the porthole lands exactly where A's crossbar goes. Rasterising the
 * candidates at 18px and magnifying the bitmap, every variant read as a glyph -
 * "A" for flared fins, a bell for a solid base, a fish for a capsule and flame.
 * An audience is also the truer metaphor: a canary release is defined by *who*
 * receives it - your team, then a beta segment, then everyone.
 */
export const UsersIcon = createIcon(
  'UsersIcon',
  <>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </>,
);

/**
 * A symmetric fork, unlike Lucide's `split`, which forks left only and reads as
 * a mistake. Each branch turns vertical before its tip so it can end in an
 * ordinary up-chevron: on a 45° branch an arrowhead's wings lie along the axes,
 * which at 18px is indistinguishable from a corner bracket, and the glyph loses
 * its arrows and flattens into a plain Y.
 */
export const SplitIcon = createIcon(
  'SplitIcon',
  <>
    <path d="M12 22v-6" />
    <path d="M12 16 6 10V4" />
    <path d="m3 7 3-3 3 3" />
    <path d="m12 16 6-6V4" />
    <path d="m15 7 3-3 3 3" />
  </>,
);

export const AlertTriangleIcon = createIcon(
  'AlertTriangleIcon',
  <>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </>,
);

export const SparklesIcon = createIcon(
  'SparklesIcon',
  <>
    <path d="M10 4c.6 3.84 2.16 5.4 6 6-3.84.6-5.4 2.16-6 6-.6-3.84-2.16-5.4-6-6 3.84-.6 5.4-2.16 6-6Z" />
    <path d="M18.5 16c.25 1.6.9 2.25 2.5 2.5-1.6.25-2.25.9-2.5 2.5-.25-1.6-.9-2.25-2.5-2.5 1.6-.25 2.25-.9 2.5-2.5Z" />
  </>,
);

export const LayersIcon = createIcon(
  'LayersIcon',
  <>
    <path d="m12 2 10 5-10 5L2 7l10-5Z" />
    <path d="m2 12 10 5 10-5" />
    <path d="m2 17 10 5 10-5" />
  </>,
);

/*
 * Flag and environment state. These render at 13–15px inline with body copy, so
 * the three flag states are deliberately distinguishable by fill and silhouette
 * alone - colour carries no meaning any of them depend on.
 */

export const CircleCheckIcon = createIcon(
  'CircleCheckIcon',
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" />
  </>,
);

/** Slashed across the full diameter: Lucide's short inner chord reads as a dash at 15px. */
export const CircleSlashIcon = createIcon(
  'CircleSlashIcon',
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="m4.93 4.93 14.14 14.14" />
  </>,
);

/**
 * The one icon here that isn't pure stroke: a half-filled disc is the whole
 * point of the glyph (it replaces `◐`), and no stroke arrangement reads as
 * "partly on" at 15px. The half-disc therefore takes an explicit
 * `fill="currentColor" stroke="none"`, overriding the factory's defaults, while
 * the outer circle stays stroked so it matches its sibling states exactly. The
 * fill runs out to r=10 and is capped by the inner half of that stroke, leaving
 * no seam.
 */
export const CircleHalfIcon = createIcon(
  'CircleHalfIcon',
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2a10 10 0 0 1 0 20Z" fill="currentColor" stroke="none" />
  </>,
);

export const DotIcon = createIcon(
  'DotIcon',
  <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />,
);

/*
 * Below here: the authenticated shell's chrome - sidebar nav glyphs, the scope
 * pickers' entity marks, and the account footer. They render at 15-16px in the
 * sidebar rail, so each one is checked to still read as itself at that size
 * rather than borrowed wholesale from a 24px reference.
 */

export const HomeIcon = createIcon(
  'HomeIcon',
  <>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
  </>,
);

export const SearchIcon = createIcon(
  'SearchIcon',
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>,
);

/**
 * The Flags nav item and the product's primary noun. Lucide's `flag` is a bare
 * outline whose pole and cloth meet at a thin acute angle that fills in at
 * 15px; this one squares the hoist and gives the cloth a single wave, so the
 * silhouette survives. Deliberately not the `ToggleMarkIcon` - that is the
 * brand mark, and reusing it for a nav row makes the row look like a logo.
 */
export const FlagIcon = createIcon(
  'FlagIcon',
  <>
    <path d="M5 21V4" />
    <path d="M5 15V4h6l1 1.5h7l-2.5 4L19 14h-7l-1-1.5H5" />
  </>,
);

/**
 * Segments - a filtered subset. Lucide's `filter` funnel at 15px loses the
 * distinction between its neck and its stem; three tracks with a handle on
 * each (a filter-list glyph) keeps three separate horizontals, which is also
 * the truer metaphor: a segment is rules narrowing an audience.
 */
export const FilterIcon = createIcon(
  'FilterIcon',
  <>
    <path d="M3 6h18" />
    <path d="M7 12h10" />
    <path d="M10 18h4" />
  </>,
);

export const KeyIcon = createIcon(
  'KeyIcon',
  <>
    <circle cx="7.5" cy="15.5" r="4.5" />
    <path d="m10.8 12.2 8.2-8.2" />
    <path d="m16 7 2.5 2.5" />
  </>,
);

/**
 * Webhooks. Lucide's mark is three arcs meeting at a hub, which at 15px merges
 * into a blob. Drawn instead as what a webhook literally is - an event (the
 * filled origin dot) pushed out to your endpoint (the bar on the right). Four
 * strokes, no two of them close enough to fuse.
 */
export const WebhookIcon = createIcon(
  'WebhookIcon',
  <>
    <circle cx="4.5" cy="12" r="2.5" fill="currentColor" stroke="none" />
    <path d="M9 12h7" />
    <path d="m13 8 4 4-4 4" />
    <path d="M20.5 4v16" />
  </>,
);

/** Integrations - a plug going into a socket. */
export const PlugIcon = createIcon(
  'PlugIcon',
  <>
    <path d="M9 3v5" />
    <path d="M15 3v5" />
    <path d="M6 8h12v3a6 6 0 0 1-12 0Z" />
    <path d="M12 17v4" />
  </>,
);

export const CreditCardIcon = createIcon(
  'CreditCardIcon',
  <>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M2 10h20" />
  </>,
);

/*
 * Settings deliberately has no icon of its own: the sidebar reuses the
 * existing `SlidersIcon`. A gear is the obvious choice, but a gear at 15px is
 * a circle inside a ring of teeth - the same silhouette as `SunIcon`, which
 * sits four rows below it in the account footer's theme toggle. Two controls
 * in one rail that resolve to the same shape is worse than a slightly less
 * conventional glyph.
 */

/** The org entity mark, in the org picker trigger and its menu rows. */
export const BuildingIcon = createIcon(
  'BuildingIcon',
  <>
    <path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16" />
    <path d="M15 9h3a2 2 0 0 1 2 2v10" />
    <path d="M2 21h20" />
    <path d="M8 7h3" />
    <path d="M8 11h3" />
    <path d="M8 15h3" />
  </>,
);

/** The project entity mark. */
export const FolderIcon = createIcon(
  'FolderIcon',
  <path d="M3 7a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.6.8L11.5 7H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
);

export const LogOutIcon = createIcon(
  'LogOutIcon',
  <>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </>,
);

export const UserIcon = createIcon(
  'UserIcon',
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
  </>,
);

/** Collapse/expand the sidebar rail: a frame with its left column filled. */
export const PanelLeftIcon = createIcon(
  'PanelLeftIcon',
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </>,
);

/**
 * The brand mark - a switch in the "on" position, standing in for the wordmark's
 * former `◆`. It sits beside bold 19px text, so the knob is a solid disc rather
 * than a ring: a stroked knob greys out next to bold type at 18–20px. Its radius
 * (3.5) is heavier than a UI toggle's would be for the same reason, and it is
 * centred on the pill's right cap at x=15, keeping a uniform 2.5 gap all round.
 */
export const ToggleMarkIcon = createIcon(
  'ToggleMarkIcon',
  <>
    <rect x="2" y="5" width="20" height="14" rx="7" />
    <circle cx="15" cy="12" r="3.5" fill="currentColor" stroke="none" />
  </>,
);

/* ── Flags surface ──────────────────────────────────────────────────────────
 * Row actions, sort affordances and the per-type glyphs. All at the 13-16px
 * the Flags table renders at, which is why the dots below are filled discs and
 * the arrows are single strokes: at that size a stroked 1.5px circle reads as
 * a smudge and a double-headed arrow fuses at the shaft.
 */

/** Row-actions trigger. Discs, not rings - a 2px ring is a smudge at 14px. */
export const MoreHorizontalIcon = createIcon(
  'MoreHorizontalIcon',
  <>
    <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
  </>,
);

/**
 * "This column is sortable, currently unsorted." Two opposed arrows on separate
 * tracks rather than Lucide's shared shaft, which at 14px reads as one arrow
 * with a bar through it.
 */
export const ArrowUpDownIcon = createIcon(
  'ArrowUpDownIcon',
  <>
    <path d="M7 20V7m0 0L4 10m3-3 3 3" />
    <path d="M17 4v13m0 0 3-3m-3 3-3-3" />
  </>,
);

/** The active sort direction; rotated 180° by the caller for ascending. */
export const ArrowDownIcon = createIcon(
  'ArrowDownIcon',
  <>
    <path d="M12 4v16" />
    <path d="m6 14 6 6 6-6" />
  </>,
);

/**
 * Copy the flag key. The offset-rectangles glyph, with the back sheet drawn as
 * an L rather than a full rect so the two outlines never sit 1px apart.
 */
export const CopyIcon = createIcon(
  'CopyIcon',
  <>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M15 5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2" />
  </>,
);

export const PencilIcon = createIcon(
  'PencilIcon',
  <>
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    <path d="m15 5 4 4" />
  </>,
);

/** Archive, not delete - a lid over a body, which is the reversible metaphor. */
export const ArchiveIcon = createIcon(
  'ArchiveIcon',
  <>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
    <path d="M10 12h4" />
  </>,
);

export const TrashIcon = createIcon(
  'TrashIcon',
  <>
    <path d="M4 7h16" />
    <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    <path d="M6 7v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7" />
  </>,
);

/**
 * `flag.update` in the audit log - a switch, lighter than `ToggleMarkIcon`,
 * which is the brand.
 *
 * This was one of three per-type glyphs (`boolean` / `string` / `string_enum`)
 * that `FlagTypeBadge` rendered before its label. They went when the Flags table
 * was rebuilt: a type is a fixed property of the definition rather than state,
 * and fifty outlined pills down a column read as fifty buttons and competed with
 * the Status badge, which is the one thing people scan a row for. Its two
 * siblings had no other caller and were deleted with it; this one survives
 * because `features/audit/audit-events.ts` uses it for the flag-changed event,
 * where a glyph per action IS the point.
 */
export const ToggleIcon = createIcon(
  'ToggleIcon',
  <>
    <rect x="2" y="7" width="20" height="10" rx="5" />
    <circle cx="16" cy="12" r="2.5" fill="currentColor" stroke="none" />
  </>,
);

/* ── Audit log surface ──────────────────────────────────────────────────────
 * The event list's per-action glyphs and timestamps, plus the detail panel's
 * before → after separator and its Raw JSON tab. These render at 12-16px, one
 * step smaller again than the Flags table above, so every one of them is drawn
 * with nothing thinner than a ~2px gap on the 24 grid and with stroke ends on
 * whole units.
 */

/** "before → after". Mirrors ArrowUpIcon exactly: head first, then the shaft. */
export const ArrowRightIcon = createIcon(
  'ArrowRightIcon',
  <>
    <path d="m12 5 7 7-7 7" />
    <path d="M5 12h14" />
  </>,
);

/**
 * Timestamps. r=9 rather than Lucide's 10: a 2px stroke at r=10 leaves the hands
 * roughly 2px of clear air at 13px and the glyph fills in at the rim. The hands
 * are `HistoryIcon`'s, unchanged, so a timestamp and the history mark read as
 * the same family rather than two people's clocks.
 */
export const ClockIcon = createIcon(
  'ClockIcon',
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l4 2" />
  </>,
);

/**
 * The "Raw JSON" tab. Pulled in from Lucide's edge-to-edge span (x=2 to x=22),
 * whose vertices sit on the viewBox edge and clip under a round cap; at 6 units
 * between the two brackets' open ends the pair also still reads as a pair rather
 * than one zigzag.
 */
export const CodeIcon = createIcon(
  'CodeIcon',
  <>
    <path d="m9 8-4 4 4 4" />
    <path d="m15 8 4 4-4 4" />
  </>,
);

/**
 * `config.rollback`. This is `HistoryIcon` minus the clock hands, deliberately:
 * a rollback is a jump backwards along exactly the history that icon stands for,
 * and the two never appear in the same view (HistoryIcon is a landing-page
 * feature card, this is an audit row).
 */
export const RotateCcwIcon = createIcon(
  'RotateCcwIcon',
  <>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </>,
);

/**
 * `ruleset.republish` - a publish. The tray is open at the top so the arrow
 * reads as leaving it; its 5-unit gap to the arrow's tail is the closest two
 * strokes come anywhere in the glyph.
 */
export const UploadIcon = createIcon(
  'UploadIcon',
  <>
    <path d="m7 9 5-5 5 5" />
    <path d="M12 16V4" />
    <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </>,
);
