import { MoonIcon, SunIcon } from '@velobits-dev/icons';
import { Button, useTheme } from '@velobits-dev/ui';

import { cn } from './cn';

/**
 * The light/dark switch on the guest landing page.
 *
 * ## What changed with the design system
 *
 * The old version held its own `useState(isDark())`, initialised by reading the
 * DOM once. That made it correct only while it was the only control on the page —
 * and it is not: the account menu has a theme item too, so flipping the theme
 * there left this button showing the wrong icon until something else re-rendered
 * it.
 *
 * `useTheme()` is a subscription to the provider mounted in `main.tsx`, so every
 * control that touches the theme now agrees. It also brings `'system'` into the
 * model: `toggle()` moves between explicit light and dark, but a user who has
 * never chosen follows their OS until they do.
 *
 * `mounted` guards the first paint. The pre-paint script in `index.html` has
 * already applied the class, but React's first render cannot know which way it
 * went, so the icon is held invisible rather than guessed at — swapping it a
 * frame later is more jarring than it arriving a frame late.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle, mounted } = useTheme();
  const dark = theme === 'dark';

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      className={cn('text-muted-foreground hover:text-fg', className)}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
    >
      {/*
       * `visibility: hidden` rather than omitted, so the button keeps its size on
       * mount and does not shift the nav row beside it.
       */}
      <span className={cn('inline-flex', !mounted && 'invisible')}>
        {dark ? <SunIcon size={16} /> : <MoonIcon size={16} />}
      </span>
    </Button>
  );
}
