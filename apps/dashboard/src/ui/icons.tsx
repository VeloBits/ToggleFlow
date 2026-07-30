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
