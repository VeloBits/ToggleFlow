import { useEffect, useRef, useState } from 'react';

import { useAuth } from '../auth/AuthContext';
import { cn } from '../ui/cn';
import { MenuIcon, ToggleMarkIcon, XIcon } from '@velobits-dev/icons';
import { Button } from '@velobits-dev/ui';
import { ThemeToggle } from '../ui/theme-toggle';

/**
 * Floating "island" nav for the public landing page - a fixed, centred bar that
 * gains its material past 40px of scroll but never changes size, so nothing under
 * it shifts. Below `md` the section links collapse into a disclosure panel, while
 * the theme toggle stays in the island at every width - it is a preference, not
 * navigation, so burying it behind a hamburger would be a step backwards.
 *
 * "Get started free" is the only auth affordance. There is no /login screen -
 * the hosted IdP takes returning users through the same authorize call - so a
 * second Sign in chip only split the click between two buttons of near-equal
 * weight and made the accent action read as optional (see GuestHomePage).
 *
 * Geometry mirrors velobits-website's Navbar so the VeloBits properties share a
 * visual language; the palette and the material are the design system's.
 */

/**
 * The hrefs are a hard contract with GuestHomePage's section ids: the anchors,
 * the scroll target and the aria-current highlight all key off the same string,
 * so a rename has to happen in both files at once. Labels are deliberately the
 * short, conventional SaaS words - four chips have to survive a tablet-width
 * island, and "Developers" tells a visitor what the section is *for* where
 * "How it works" only promised an explanation.
 */
const NAV_LINKS: { href: string; label: string }[] = [
  { href: '#features', label: 'Features' },
  { href: '#how', label: 'Developers' },
  { href: '#use-cases', label: 'Use cases' },
  { href: '#faq', label: 'FAQ' },
];

/**
 * ## The island's material is the design system's tier-O glass
 *
 * This used to be four hand-written strings: a `bg-panel/80` fill, a
 * `backdrop-blur-[18px]`, and two bespoke per-theme `box-shadow` pairs (one set
 * for at-rest, one for scrolled). All of that is `.glass` in
 * `@velobits-dev/tokens/glass.css`, and the token layer's version is the one that
 * has been measured: tier O is gated against all seven worst-case backdrops in
 * the palette, because an overlay's backdrop is unknowable - which is exactly the
 * situation a bar floating over a scrolling page is in. It also steps muted text
 * up to `--muted-on-glass` for its descendants, so the nav's own link colour
 * firms up on glass without any call site knowing.
 *
 * `.glass` sets `background`, `backdrop-filter`, the one sanctioned translucent
 * `border` and `box-shadow` together. **Do not add a `bg-*`, `border-*` or
 * `shadow-*` utility to the element carrying it** - utilities are a later layer,
 * so each one silently removes the part of the material it names.
 *
 * ## At rest vs scrolled
 *
 * Kept, and now it is the material itself that arrives rather than a shadow
 * getting heavier: at the top of the page the island is chromeless and the hero's
 * aurora wash reads straight through it; past 40px, content is passing underneath
 * and the glass appears to separate the two. `border-transparent` at rest is what
 * keeps the geometry identical across the switch - `.glass`'s border is 1px, so
 * without it the bar would jump by a pixel on first scroll.
 */
const SURFACE_TOP = 'border border-transparent';
const SURFACE_SCROLLED = 'glass';

/**
 * Section anchor as a pill hover-chip. Muted, so the accent stays with the CTA.
 * The horizontal padding is tight at `md` - four chips plus the brand and the
 * action cluster leave under 100px of slack on a 768px island - and relaxes at
 * `lg`, where the original 0.85rem rhythm from velobits-website fits again.
 *
 * No focus classes: the token layer's base `:focus-visible` rule draws one ring
 * for the whole system, and a local `focus-visible:outline-none` would delete it.
 */
const LINK =
  'text-muted-foreground hover:bg-highlight hover:text-fg rounded-pill px-2.5 py-[0.42rem] text-[13px] font-medium whitespace-nowrap transition-colors duration-micro motion-reduce:transition-none lg:px-[0.85rem]';

export function GuestNav({ returnTo }: { returnTo: string }) {
  const { signup } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeHash, setActiveHash] = useState(() => window.location.hash);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll(); // browsers restore scroll position on reload
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // aria-current follows the fragment so back/forward and deep links stay right;
  // the click handlers below also set it, since hashchange fires asynchronously.
  useEffect(() => {
    const onHashChange = () => setActiveHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      toggleRef.current?.focus();
    };
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || toggleRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [menuOpen]);

  const linkProps = (href: string) => ({
    href,
    'aria-current': activeHash === href ? ('location' as const) : undefined,
    onClick: () => setActiveHash(href),
  });

  return (
    <>
      {/* px-6, matching every section's gutter: at px-4 the island was 8px wider
          a side than the page content at every width below ~1200px. */}
      <header className="pointer-events-none fixed top-0 right-0 left-0 z-50 flex justify-center px-6 pt-4 pb-4">
        <nav
          id="site-nav"
          aria-label="Main"
          data-scrolled={scrolled ? 'true' : 'false'}
          className={cn(
            // rounded-xl (14px) is the same radius as the hero's flag panel and
            // the mobile menu card, so the bar reads as one of the page's
            // surfaces. max-w-page is `--container-page` from the token layer -
            // the same 72rem the hero, every section and the footer use, so the
            // island's box edges are the page's left and right reference lines
            // rather than nearly them.
            // The outer gap steps up in three stages rather than one: at `md` the
            // four chips need every pixel, by `lg` the island is wide enough for
            // the airier spacing the marketing site uses.
            'pointer-events-auto flex w-full max-w-page items-center justify-between gap-2 rounded-xl px-2 py-[0.55rem] pl-3 transition-[background-color,border-color,box-shadow] duration-page motion-reduce:transition-none sm:px-4 sm:pl-[1.1rem] md:gap-3 lg:gap-6',
            scrolled ? SURFACE_SCROLLED : SURFACE_TOP,
          )}
        >
          {/* Not a link - a guest reading this page is already home. The mark is a
              switch in the on position: the product's own metaphor, and it holds
              its shape at 20px where the old ◆ glyph depended on the font. */}
          <span className="flex shrink-0 items-center gap-2">
            <ToggleMarkIcon size={20} className="text-primary" />
            <span className="font-bold">ToggleFlow</span>
          </span>

          {/*
            Links appear at `md`, not `sm`: four chips plus brand and actions
            overflow a 640px island, and a squeezed centre cluster looks worse
            than the disclosure panel, which is a familiar pattern at that width.
          */}
          <div className="hidden flex-1 items-center justify-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                {...linkProps(link.href)}
                className={cn(
                  LINK,
                  'inline-flex items-center',
                  activeHash === link.href && 'bg-primary-soft text-fg',
                )}
              >
                {link.label}
              </a>
            ))}
          </div>

          {/*
            Utility items first, then the hairline, then the CTA - so the accent
            fill is the last thing in the bar and stays the visual terminus.
          */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-2.5 lg:gap-3">
            <ThemeToggle
              // 44px square below `sm`, where the hamburger is its neighbour and
              // touch is the input mode; it drops to 32px exactly where the CTA
              // appears, because 32px lands within a pixel of that button's
              // computed height - a 44px hover circle beside a 31px pill reads as
              // two unrelated controls. Everything else it needs (ghost paint,
              // hover wash, focus ring) is already on the Button it renders.
              className="rounded-pill size-11 sm:size-8"
            />
            <span aria-hidden className="bg-border hidden h-[18px] w-px rounded-full sm:block" />
            {/*
              The CTA comes back at `sm`, one step earlier than the links: it is
              the page's only auth entry point, so it stays on the bar through the
              640–767px band where the sections have already folded away. It is
              hidden below that only because brand + theme + CTA + hamburger stop
              fitting around 380px.

              `primary`, not `brand`: the hero owns the page's single lime button,
              and two different-coloured buttons both saying "Get started free"
              would read as two different offers.
            */}
            <Button
              variant="primary"
              size="sm"
              className="rounded-pill hidden font-semibold sm:inline-flex"
              onClick={() => void signup(returnTo)}
            >
              Get started free
            </Button>
            <Button
              ref={toggleRef}
              variant="ghost"
              size="icon"
              aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen((open) => !open)}
              className="rounded-pill size-11 md:hidden"
            >
              {menuOpen ? <XIcon size={20} /> : <MenuIcon size={20} />}
            </Button>
          </div>
        </nav>

        {menuOpen && (
          // `top-full` lands the panel exactly the header's pb-4 below the island
          // at any nav height - no magic offset to retune. The inset tracks the
          // header's px-6, so the panel is exactly as wide as the island above it.
          //
          // Tier O again, and for the textbook reason: this floats over whatever
          // the visitor had scrolled to. It is a SIBLING of the nav, not a child,
          // so the two glass layers never nest.
          <div
            ref={menuRef}
            id="mobile-menu"
            className="glass pointer-events-auto absolute top-full right-6 left-6 flex flex-col gap-1 rounded-xl p-3 md:hidden"
          >
            <nav aria-label="Page" className="flex flex-col gap-1">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  {...linkProps(link.href)}
                  onClick={() => {
                    setActiveHash(link.href);
                    setMenuOpen(false);
                  }}
                  className={cn(
                    LINK,
                    'flex items-center rounded-lg px-3 py-3 text-[14px]',
                    activeHash === link.href && 'bg-primary-soft text-fg',
                  )}
                >
                  {link.label}
                </a>
              ))}
            </nav>
            {/* Separates navigation from action, so the CTA doesn't read as a fifth link. */}
            <span aria-hidden className="bg-border/70 my-1 h-px w-full" />
            <Button
              variant="primary"
              className="rounded-pill w-full font-semibold"
              onClick={() => {
                setMenuOpen(false);
                void signup(returnTo);
              }}
            >
              Get started free
            </Button>
          </div>
        )}
      </header>

      {menuOpen && (
        <div
          aria-hidden
          className="bg-overlay fixed inset-0 z-40 md:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}
    </>
  );
}
