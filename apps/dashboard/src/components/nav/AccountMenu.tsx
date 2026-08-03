/**
 * The sidebar's foot: who you are, which organization and role you are acting
 * under, and the account actions that used to be scattered across the top bar.
 *
 * This is the Slack/GitHub/Linear placement, and it is not only convention:
 * the top bar answers "what am I looking at", and identity is not part of that
 * answer. Putting it at the bottom of the rail also means the destructive
 * action (sign out) is as far as it can be from the scope switchers, which are
 * the controls people click fastest.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../auth/AuthContext';
import { useWorkspace } from '../../state/WorkspaceContext';
import { cn } from '../../ui/cn';
import {
  ChevronsUpDownIcon,
  LogOutIcon,
  MoonIcon,
  SlidersIcon,
  SunIcon,
  UserIcon,
} from '../../ui/icons';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '../../ui/menu';
import { isDark, toggleTheme } from '../../ui/theme';

/**
 * Two letters from the display name, or one from the email. Deliberately not a
 * generated colour: the palette reserves colour for meaning (env and flag
 * state), and a randomly-tinted avatar competes with the environment dot two
 * rows above it.
 */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts.at(-1)![0]!).toUpperCase();
}

export function AccountMenu({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const ws = useWorkspace();
  const [dark, setDark] = useState(isDark);

  const email = ws.me?.user.email ?? user?.profile.email ?? '';
  const displayName = ws.me?.user.displayName ?? email;

  return (
    <Menu>
      <MenuTrigger
        aria-label="Account menu"
        className="hover:bg-highlight focus-visible:ring-accent group flex w-full items-center gap-2.5 rounded-md border-0 bg-transparent p-2 text-left transition-colors duration-100 focus-visible:ring-2 focus-visible:outline-none motion-reduce:transition-none"
      >
        <span
          aria-hidden
          className="bg-accent-soft text-accent flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
        >
          {initials(displayName || '?')}
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-text block truncate text-[13px] font-medium">
            {displayName || '…'}
          </span>
          {/* Organization and role: the context every action on the page runs
              under, so it is stated permanently rather than only inside the menu. */}
          <span className="text-muted block truncate text-[11.5px]">
            {ws.org ? `${ws.org.name} · ${ws.role}` : '…'}
          </span>
        </span>
        <ChevronsUpDownIcon size={13} className="text-muted group-hover:text-text shrink-0" />
      </MenuTrigger>

      <MenuContent side="top" align="start" className="min-w-[15rem]">
        <div className="px-2 py-1.5">
          <p className="text-text m-0 truncate text-[13px] font-medium">{displayName}</p>
          {email && email !== displayName && (
            <p className="text-muted m-0 truncate text-[12px]">{email}</p>
          )}
        </div>
        <MenuSeparator />

        {ws.org && (
          <>
            <MenuLabel>Signed in to</MenuLabel>
            <div className="flex items-center gap-2 px-2 pb-1.5">
              <span className="text-text min-w-0 flex-1 truncate text-[13px]">{ws.org.name}</span>
              <span className="chip chip-role shrink-0">{ws.role}</span>
            </div>
            <MenuSeparator />
          </>
        )}

        <MenuItem asChild onSelect={onNavigate}>
          <Link to="/settings">
            <SlidersIcon size={15} className="shrink-0" />
            Settings
          </Link>
        </MenuItem>
        <MenuItem asChild onSelect={onNavigate}>
          <Link to="/team">
            <UserIcon size={15} className="shrink-0" />
            Team &amp; roles
          </Link>
        </MenuItem>

        {/*
          Preventing the default select keeps the menu open, so the user can see
          the theme change and flip back without reopening - the one item here
          you might plausibly use twice in a row.
        */}
        <MenuItem
          onSelect={(event) => {
            event.preventDefault();
            setDark(toggleTheme());
          }}
        >
          {dark ? (
            <SunIcon size={15} className="shrink-0" />
          ) : (
            <MoonIcon size={15} className="shrink-0" />
          )}
          {dark ? 'Switch to light theme' : 'Switch to dark theme'}
        </MenuItem>

        <MenuSeparator />
        <MenuItem
          className={cn('text-off data-[highlighted]:text-off')}
          onSelect={() => void logout()}
        >
          <LogOutIcon size={15} className="shrink-0" />
          Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
