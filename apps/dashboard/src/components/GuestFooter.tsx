import type { ReactNode } from 'react';

import { useAuth } from '../auth/AuthContext';
import { cn } from '../ui/cn';
import { ArrowUpIcon, ToggleMarkIcon } from '../ui/icons';

/**
 * Footer for the public landing page - a brand column plus four link groups over
 * a bottom bar. It replaces the single thin strip the page shipped with, which
 * carried one sentence and a second Sign in button.
 *
 * Structure and rhythm are lifted from velobits-website's Footer so the two
 * VeloBits properties read as one company: brand mark + blurb + social buttons
 * on the left, uppercase group headings, a hairline above a copyright bar. The
 * palette is not lifted - that site is dark-only lime, this has to hold up in
 * light and dark on ToggleFlow's own tokens.
 *
 * Every href here resolves to something that actually exists: an id on this
 * page, the GitHub repo, or velobits.dev. The two Legal entries are the only
 * placeholders (see LINK_GROUPS) and are called out there. Groups are short on
 * purpose - a footer that advertises a changelog, status page, and docs site
 * that nobody has built yet is worse than a footer with three honest links.
 */

const GITHUB_REPO = 'https://github.com/VeloBits/ToggleFlow';
const GITHUB_ORG = 'https://github.com/VeloBits';
const VELOBITS_SITE = 'https://velobits.dev';

interface FooterLink {
  label: string;
  href: string;
}

interface FooterGroup {
  /** Ties the heading to its `<nav>` via aria-labelledby, so the group is named. */
  id: string;
  title: string;
  links: FooterLink[];
}

const LINK_GROUPS: FooterGroup[] = [
  {
    id: 'footer-product',
    title: 'Product',
    // Section anchors, and only ids that exist on this page (same set the nav uses).
    links: [
      { label: 'Features', href: '#features' },
      { label: 'Use cases', href: '#use-cases' },
      { label: 'FAQ', href: '#faq' },
    ],
  },
  {
    id: 'footer-developers',
    title: 'Developers',
    // The "Resources" slot. There is no docs site yet, so this points at the two
    // things that are real: the #how section (which shows the actual SDK call)
    // and the repo. "How it works" is deliberately filed here rather than under
    // Product so no two entries in this footer lead to the same place.
    links: [
      { label: 'Quickstart', href: '#how' },
      { label: 'SDKs & source', href: GITHUB_REPO },
      { label: 'Report an issue', href: `${GITHUB_REPO}/issues` },
    ],
  },
  {
    id: 'footer-company',
    title: 'Company',
    links: [
      { label: 'About VeloBits', href: VELOBITS_SITE },
      { label: 'VeloBits on GitHub', href: GITHUB_ORG },
    ],
  },
  {
    id: 'footer-legal',
    title: 'Legal',
    // TODO: both of these need real routes (or hosted pages) before launch -
    // '#' is a holding pattern, matching velobits-website's footer, not a
    // destination. Nothing else in this footer is a placeholder, and nothing
    // here promises a policy exists: the labels are the standard two names a
    // visitor scans for, and a '#' keeps them from silently 404ing.
    links: [
      { label: 'Privacy Policy', href: '#' },
      { label: 'Terms of Service', href: '#' },
    ],
  },
];

/**
 * Inline rather than pulled from `../ui/icons`: that set is stroke-based
 * (Feather geometry, `fill="none"`) and the GitHub mark only reads correctly as
 * a filled glyph, so it doesn't belong in that file's stroke pipeline.
 */
function GitHubIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
    </svg>
  );
}

/**
 * GitHub only. The sibling site keeps an x.com handle in its brand config but
 * its footer renders GitHub alone, and an unverified handle in a launch footer
 * is a dead end with a logo on it. One real icon beats five invented ones - add
 * a network here the day the account exists.
 */
const SOCIAL_LINKS: { label: string; href: string; icon: ReactNode }[] = [
  { label: 'ToggleFlow on GitHub', href: GITHUB_REPO, icon: <GitHubIcon /> },
];

/** Same ring as GuestNav, so focus looks identical top and bottom of the page. */
const FOCUS = 'focus-visible:ring-accent focus-visible:ring-2 focus-visible:outline-none';

/**
 * Group link. `text-muted` is explicit because styles.css sets `a { color:
 * var(--accent) }` - utilities win (styles.css is imported into the components
 * layer) but only where one is actually written. `py-1.5` is for the thumb, not
 * the look: it lifts each row to ~30px so stacked links are tappable at 320px.
 */
const LINK = `text-muted hover:text-text rounded-sm py-1.5 text-[13px] leading-snug transition-colors duration-150 motion-reduce:transition-none ${FOCUS}`;

/** Bottom-bar link - smaller, same treatment. */
const META_LINK = `text-muted hover:text-text rounded-sm text-[12.5px] transition-colors duration-150 motion-reduce:transition-none ${FOCUS}`;

/**
 * The one accent action in the footer. `rounded-md` (6px) rather than the nav's
 * pill: down here the neighbours are the page's body buttons, which are 6px.
 * Border/background are written out to undo the legacy unlayered `button` box,
 * and the ring gets an offset in the page background so it stays visible
 * against the accent fill.
 */
const CTA = cn(
  'border-accent bg-accent hover:border-accent-hover hover:bg-accent-hover inline-flex items-center',
  'rounded-md border px-4 py-2 text-[13px] font-semibold whitespace-nowrap text-white',
  'focus-visible:ring-offset-bg transition-colors duration-150 focus-visible:ring-offset-2',
  'motion-reduce:transition-none',
  FOCUS,
);

/** Icon-only social chip. An `<a>`, so only the `a { color }` rule needs undoing. */
const SOCIAL = cn(
  'border-border bg-panel text-muted hover:border-border-strong hover:text-text',
  'inline-flex h-9 w-9 items-center justify-center rounded-lg border',
  'transition-colors duration-150 motion-reduce:transition-none',
  FOCUS,
);

/** http(s) links leave the site; anchors and '#' stay on the page. */
const isExternal = (href: string) => href.startsWith('http');

export function GuestFooter({ returnTo }: { returnTo: string }) {
  const { signup } = useAuth();
  // Computed, not hardcoded - a stale copyright year is the cheapest way to look
  // abandoned. This is a static landing page render, so no need to keep it live.
  const year = new Date().getFullYear();

  return (
    <footer className="border-border/60 border-t px-6">
      {/* The gutter is on the <footer>, OUTSIDE the cap: with border-box sizing an
          inner `max-w-page px-6` spends the padding out of the 1152px, which put
          the footer's content 24px inside the hero's edges on any display wide
          enough to cap. The hairline above is unaffected - padding does not move a
          block's border, so it still runs the full viewport. pt joins the sections'
          rhythm (64/80px); pb-8 is a terminal, not a step in it. */}
      <div className="mx-auto w-full max-w-page pt-16 pb-8 sm:pt-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:gap-12">
          <div className="min-w-0">
            {/* Not a link, for the same reason the nav's brand isn't: this is home.
                Same mark and size as the nav's, so the page opens and closes on it. */}
            <span className="flex items-center gap-2">
              <ToggleMarkIcon size={20} className="text-accent" />
              <span className="font-bold">ToggleFlow</span>
            </span>
            {/* Restates the hero's positioning in one line - keep the two in step. */}
            <p className="text-muted mt-3 max-w-[34ch] text-[13px] leading-relaxed">
              Feature flags and remote configuration for modern apps. Kill switches, progressive
              rollouts, targeting, and versioned config - without a redeploy.
            </p>
            {/* Carries returnTo like every other auth entry point, so a visitor who
                landed on a deep link still lands there after the Keycloak round trip.
                A guest who scrolled this far past the closing CTA gets one more door. */}
            <button type="button" className={cn(CTA, 'mt-5')} onClick={() => void signup(returnTo)}>
              Get started free
            </button>
            <ul className="mt-6 flex flex-wrap gap-2">
              {SOCIAL_LINKS.map((social) => (
                <li key={social.label}>
                  <a
                    href={social.href}
                    aria-label={social.label}
                    target="_blank"
                    rel="noreferrer"
                    className={SOCIAL}
                  >
                    {social.icon}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* 4 → 2 → 1. The outer grid only splits at lg, so between sm and lg the
              four groups get the full width and stay comfortable. */}
          <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 md:grid-cols-4">
            {LINK_GROUPS.map((group) => (
              <nav key={group.id} aria-labelledby={group.id} className="min-w-0">
                {/*
                 * A real heading, so the groups aren't anonymous link soup, and the
                 * <nav> borrows it as its accessible name. Size/weight/margin are
                 * explicit: theme.css's base layer makes h2 18px/600 and styles.css
                 * gives it a bottom margin. Headings sit at full text strength
                 * against muted links - the page spends its accent on eyebrows and
                 * CTAs, and four accent headings down here would shout over both.
                 */}
                <h2
                  id={group.id}
                  className="text-text mb-2 text-[11.5px] font-semibold tracking-[0.09em] uppercase"
                >
                  {group.title}
                </h2>
                <ul className="flex flex-col items-start gap-0.5">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className={LINK}
                        {...(isExternal(link.href) ? { target: '_blank', rel: 'noreferrer' } : {})}
                      >
                        {link.label}
                        {isExternal(link.href) && (
                          <span className="sr-only"> (opens in a new tab)</span>
                        )}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        {/* Hairline, then the bottom bar. A plain border, not the sibling site's
            gradient rule - that reads as decoration on a light background. */}
        <div className="border-border/60 mt-12 border-t pt-6">
          <div
            className={cn(
              'text-muted flex flex-col gap-3 text-[12.5px]',
              'sm:flex-row sm:items-center sm:justify-between',
            )}
          >
            <p>© {year} VeloBits. All rights reserved.</p>
            <div className="flex flex-wrap items-center gap-3">
              <span>ToggleFlow - a VeloBits product</span>
              <span aria-hidden className="bg-border hidden h-3 w-px sm:block" />
              {/* #main is the <main> landmark at the top of the page, so this is a
                  real target and doubles as a keyboard route back to the content. */}
              <a href="#main" className={cn(META_LINK, 'inline-flex items-center gap-1.5')}>
                Back to top
                <ArrowUpIcon size={13} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
