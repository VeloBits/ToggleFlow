import { useState } from 'react';

import { cn } from './cn';
import { MoonIcon, SunIcon } from './icons';
import { isDark, toggleTheme } from './theme';

/** Light/dark switch — shared by the app shell topbar and the public guest home. */
export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(isDark);
  return (
    <button
      type="button"
      className={cn('ghost inline-flex items-center justify-center', className)}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
      onClick={() => setDark(toggleTheme())}
    >
      {dark ? <SunIcon size={16} /> : <MoonIcon size={16} />}
    </button>
  );
}
