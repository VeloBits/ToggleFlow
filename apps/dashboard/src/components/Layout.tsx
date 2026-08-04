/**
 * The authenticated shell: a fixed top bar over a nav rail and the page.
 *
 * The rail is a real grid column at `md` and up and an overlay drawer below
 * it. Both render the same <AppSidebar>, so a nav item added to nav-items.ts
 * appears in both without either being kept in sync by hand.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { XIcon } from '../ui/icons';
import { AppSidebar } from './nav/AppSidebar';
import { AppTopbar, BrandMark } from './nav/AppTopbar';

export function Layout({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { pathname } = useLocation();

  // A drawer left open across a navigation would cover the page the user just
  // asked for. Rail clicks close it themselves; this also covers the cases
  // that do not go through a nav row (browser back, a link inside the page).
  useEffect(() => setDrawerOpen(false), [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  return (
    <div className="bg-bg flex h-screen flex-col">
      <AppTopbar onOpenSidebar={() => setDrawerOpen(true)} />

      <div className="flex min-h-0 flex-1">
        {/* `md:flex` rather than a responsive grid: the drawer copy below has
            to leave the flow entirely, and a grid column cannot. */}
        <aside className="border-border hidden w-60 shrink-0 border-r md:flex">
          <AppSidebar />
        </aside>

        {drawerOpen && (
          <>
            <div
              aria-hidden
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-40 bg-black/45 md:hidden"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              className="border-border bg-panel fixed inset-y-0 left-0 z-50 flex w-[17rem] flex-col border-r md:hidden"
            >
              <div className="border-border flex h-13 shrink-0 items-center justify-between border-b px-3">
                <BrandMark />
                <button
                  type="button"
                  autoFocus
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close navigation menu"
                  className="text-muted-foreground hover:bg-highlight hover:text-text focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md border-0 bg-transparent p-0 focus-visible:ring-2 focus-visible:outline-none"
                >
                  <XIcon size={18} />
                </button>
              </div>
              <div className="min-h-0 flex-1">
                <AppSidebar onNavigate={() => setDrawerOpen(false)} />
              </div>
            </div>
          </>
        )}

        <main className="min-w-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
