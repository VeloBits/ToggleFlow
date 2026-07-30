import { useEffect, useRef, useState } from 'react';

import { useAuth } from '../auth/AuthContext';
import { cn } from '../ui/cn';
import { MenuIcon, XIcon } from '../ui/icons';
import { ThemeToggle } from '../ui/theme-toggle';

/**
 * Floating "island" nav for the public landing page — a fixed, centred bar that
 * gains weight past 40px of scroll but never changes size, so nothing under it
 * shifts. Below `md` the section links collapse into a disclosure panel, while
 * the theme toggle stays in the island at every width — it is a preference, not
 * navigation, so burying it behind a hamburger would be a step backwards.
 *
 * "Get started free" is the only auth affordance. There is no /login screen —
 * the hosted IdP takes returning users through the same authorize call — so a
 * second Sign in chip only split the click between two buttons of near-equal
 * weight and made the accent action read as optional (see GuestHomePage).
 *
 * Geometry mirrors velobits-website's Navbar so the VeloBits properties share a
 * visual language; the palette is ToggleFlow's own tokens (that site is
 * dark-only lime, this must work in light and dark on the product accent).
 */

/**
 * The hrefs are a hard contract with GuestHomePage's section ids: the anchors,
 * the scroll target and the aria-current highlight all key off the same string,
 * so a rename has to happen in both files at once. Labels are deliberately the
 * short, conventional SaaS words — four chips have to survive a tablet-width
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
 * At rest. In light mode --panel (#fff) ≈ --bg (#f8f8f8), so the fill reads as
 * almost nothing on purpose: the hairline border and an ambient shadow do the
 * separating. Dark mode's --panel is lighter than its --bg, so translucency is
 * genuinely visible there and the border can step back.
 */
const SURFACE_TOP =
  'border-border/80 bg-panel/80 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_6px_20px_rgba(0,0,0,0.05)] dark:border-border/60 dark:bg-panel/55 dark:shadow-[0_1px_2px_rgba(0,0,0,0.25),0_6px_20px_rgba(0,0,0,0.28)]';

/** Scrolled: content is passing underneath, so the pill goes near-opaque and lifts. */
const SURFACE_SCROLLED =
  'border-border bg-panel/95 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_10px_30px_rgba(0,0,0,0.10)] dark:border-border-strong dark:bg-panel/85 dark:shadow-[0_1px_2px_rgba(0,0,0,0.40),0_12px_34px_rgba(0,0,0,0.45)]';

const FOCUS = 'focus-visible:ring-accent focus-visible:ring-2 focus-visible:outline-none';

/**
 * Section anchor as a pill hover-chip. Muted, so the accent stays with the CTA.
 * The horizontal padding is tight at `md` — four chips plus the brand and the
 * action cluster leave under 100px of slack on a 768px island — and relaxes at
 * `lg`, where the original 0.85rem rhythm from velobits-website fits again.
 */
const LINK = `text-muted hover:bg-highlight hover:text-text rounded-pill px-2.5 py-[0.42rem] text-[13px] font-medium whitespace-nowrap transition-colors duration-150 motion-reduce:transition-none lg:px-[0.85rem] ${FOCUS}`;

/** The one accent action. Ring offset keeps the focus ring visible on accent fill. */
const CTA = `border-accent bg-accent hover:border-accent-hover hover:bg-accent-hover focus-visible:ring-offset-panel shrink-0 rounded-pill border px-4 py-1.5 text-[13px] font-semibold whitespace-nowrap text-white transition-colors duration-150 focus-visible:ring-offset-2 motion-reduce:transition-none ${FOCUS}`;

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
      <header className="pointer-events-none fixed top-0 right-0 left-0 z-50 flex justify-center px-4 pt-4 pb-4">
        <nav
          id="site-nav"
          aria-label="Main"
          data-scrolled={scrolled ? 'true' : 'false'}
          className={cn(
            // rounded-xl (10px) is the same radius as the hero's flag panel and the
            // mobile menu card, so the bar reads as one of the page's surfaces.
            // max-w-6xl matches the page content grid, so its edges line up with
            // the hero instead of sitting almost-but-not-quite inside it.
            // The outer gap steps up in three stages rather than one: at `md` the
            // four chips need every pixel, by `lg` the island is wide enough for
            // the airier spacing the marketing site uses.
            'pointer-events-auto flex w-full max-w-6xl items-center justify-between gap-2 rounded-xl border px-2 py-[0.55rem] pl-3 backdrop-blur-[18px] transition-[background-color,border-color,box-shadow] duration-300 motion-reduce:transition-none sm:px-4 sm:pl-[1.1rem] md:gap-3 lg:gap-6',
            scrolled ? SURFACE_SCROLLED : SURFACE_TOP,
          )}
        >
          {/* Not a link — a guest reading this page is already home. */}
          <span className="flex shrink-0 items-center gap-2">
            <span className="text-accent font-bold" aria-hidden>
              ◆
            </span>
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
                  activeHash === link.href && 'bg-accent-soft text-text',
                )}
              >
                {link.label}
              </a>
            ))}
          </div>

          {/*
            Utility items first, then the hairline, then the CTA — so the accent
            fill is the last thing in the bar and stays the visual terminus.
          */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-2.5 lg:gap-3">
            <ThemeToggle
              className={cn(
                // 44px square below `sm`, where the hamburger is its neighbour and
                // touch is the input mode; it drops to 32px exactly where the CTA
                // appears, because 32px lands within a pixel of that button's
                // computed height — a 44px hover circle beside a 31px pill reads
                // as two unrelated controls. Vertical centring is the flex row's.
                'text-muted hover:bg-highlight hover:text-text rounded-pill h-11 w-11 p-0 transition-colors duration-150 motion-reduce:transition-none sm:h-8 sm:w-8',
                FOCUS,
              )}
            />
            <span aria-hidden className="bg-border hidden h-[18px] w-px rounded-full sm:block" />
            {/*
              The CTA comes back at `sm`, one step earlier than the links: it is
              the page's only auth entry point, so it stays on the bar through the
              640–767px band where the sections have already folded away. It is
              hidden below that only because brand + theme + CTA + hamburger stop
              fitting around 380px.
            */}
            <button
              type="button"
              className={cn(CTA, 'hidden items-center sm:inline-flex')}
              onClick={() => void signup(returnTo)}
            >
              Get started free
            </button>
            <button
              ref={toggleRef}
              type="button"
              aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen((open) => !open)}
              className={cn(
                'text-text hover:bg-highlight rounded-pill inline-flex h-11 w-11 shrink-0 items-center justify-center border-0 bg-transparent p-0 transition-colors duration-150 motion-reduce:transition-none md:hidden',
                FOCUS,
              )}
            >
              {menuOpen ? <XIcon size={20} /> : <MenuIcon size={20} />}
            </button>
          </div>
        </nav>

        {menuOpen && (
          // `top-full` lands the panel exactly the header's pb-4 below the island
          // at any nav height — no magic offset to retune.
          <div
            ref={menuRef}
            id="mobile-menu"
            className="border-border bg-panel pointer-events-auto absolute top-full right-4 left-4 flex flex-col gap-1 rounded-xl border p-3 shadow-[0_16px_40px_rgba(0,0,0,0.14)] md:hidden dark:shadow-[0_16px_40px_rgba(0,0,0,0.55)]"
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
                    activeHash === link.href && 'bg-accent-soft text-text',
                  )}
                >
                  {link.label}
                </a>
              ))}
            </nav>
            {/* Separates navigation from action, so the CTA doesn't read as a fifth link. */}
            <span aria-hidden className="bg-border/70 my-1 h-px w-full" />
            <button
              type="button"
              className={cn(CTA, 'flex w-full justify-center py-2.5 text-[14px]')}
              onClick={() => {
                setMenuOpen(false);
                void signup(returnTo);
              }}
            >
              Get started free
            </button>
          </div>
        )}
      </header>

      {menuOpen && (
        <div
          aria-hidden
          className="fixed inset-0 z-40 bg-black/45 md:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}
    </>
  );
}
