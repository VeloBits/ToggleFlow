/**
 * The authenticated shell: a sticky top bar over a nav rail and the page.
 *
 * ## This is now `AppShell` from the design system, and that deleted real code
 *
 * The hand-rolled version here was a `md:flex` rail plus a conditionally
 * rendered `role="dialog"` drawer, a scrim, and a hand-bound Escape listener.
 * It worked, and it was missing three things that are invisible until someone
 * hits them:
 *
 * - **Focus restoration.** Closing the drawer dropped focus to `<body>`, so the
 *   next Tab restarted from the top of the document. `AppShell`'s drawer is a
 *   `SidePanel`, i.e. a real Radix dialog, so focus returns to the hamburger.
 * - **A focus trap and a scroll lock.** The old drawer had neither: Tab walked
 *   straight out of it into the page behind the scrim, and the page scrolled
 *   under it.
 * - **A skip link.** The authenticated app had none at all — only the guest
 *   landing page did. `AppShell` renders one to `#${mainId}`.
 *
 * It also closes itself when the viewport crosses to `md`, which the old one did
 * not: resizing with the drawer open left the rail and the drawer both showing.
 *
 * ## What stays our job
 *
 * `AppShell` has no router, so it cannot close the drawer on navigation — that
 * is the `useEffect` below, and it is the reason this component is still
 * controlled rather than letting the shell own its own state. A drawer left open
 * across a navigation covers the page the user just asked for.
 *
 * The sidebar node is rendered **twice** (rail and drawer), so it must be
 * idempotent: no `id` attributes, and no uncontrolled state worth keeping. Ours
 * satisfies that — `AppSidebar` is a pure function of the route.
 */
import { AppShell, AppShellHeader, AppShellSidebarTrigger } from '@velobits-dev/ui';
// Subpath, not the barrel: `motion` is deliberately kept out of it so that
// importing a Button does not pull in Framer's runtime.
import { PageTransition } from '@velobits-dev/ui/motion';
import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { AppSidebar } from './nav/AppSidebar';
import { AppTopbarContent, BrandMark } from './nav/AppTopbar';

export function Layout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();

  // Rail clicks close the drawer themselves; this also covers the cases that do
  // not go through a nav row — browser back, a link inside the page, a redirect.
  useEffect(() => setSidebarOpen(false), [pathname]);

  return (
    <AppShell
      sidebarOpen={sidebarOpen}
      onSidebarOpenChange={setSidebarOpen}
      sidebarLabel="Main"
      /*
       * The shell root is what owns `bg-bg`, so it is where the page texture
       * goes. Everything translucent in the app is measured against this: the
       * dot grid is the high-frequency detail a glass surface has to sit over
       * for the tier to read as a material rather than a flat tint.
       */
      className="page-texture"
      /*
       * Both surfaces are the shell's glass defaults now — the rail is Tier S,
       * the header Tier O.
       *
       * The rail deliberately does NOT take `.glass-surface-blur`. On desktop
       * this shell is a flex row: the rail is a `shrink-0` sibling of `main`
       * and `main` is its own scroll container, so nothing ever passes behind
       * the rail and a live backdrop layer would re-sample every frame to
       * produce the same picture. The mobile drawer is a different surface
       * (SidePanel, Tier O) and genuinely does float over content.
       *
       * The backdrop-filter caveat that used to justify `panel` here still
       * holds for the header, which is Tier O and blurs unconditionally: a
       * `position: fixed` descendant of it would be trapped in its containing
       * block. Nothing in the header is fixed today — the Radix menus portal to
       * `body` — so this is a constraint on what may be added, not a live bug.
       */
      mainId="main"
      mainClassName="px-5 py-5 sm:px-6"
      header={
        <AppShellHeader className="gap-1">
          <AppShellSidebarTrigger />
          <BrandMark asLink />
          <span aria-hidden className="bg-border mx-1.5 hidden h-5 w-px sm:block" />
          <AppTopbarContent />
        </AppShellHeader>
      }
      sidebar={<AppSidebar onNavigate={() => setSidebarOpen(false)} />}
    >
      {/*
       * Keyed on `pathname`, which is the value that actually changes per route
       * — a constant key renders once and then never animates again, which
       * reads as a broken transition rather than a wrong key.
       *
       * Reduced motion is NOT handled here: `VelobitsProvider` mounts
       * `MotionConfig reducedMotion="user"`, so Framer already drops the
       * transform for anyone who asked. Re-checking it at the call site would
       * be a second source of truth that can disagree with the first.
       */}
      <PageTransition transitionKey={pathname}>{children}</PageTransition>
    </AppShell>
  );
}
