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
import {
  ChevronsUpDownIcon,
  LogOutIcon,
  MoonIcon,
  SlidersIcon,
  SunIcon,
  UserIcon,
} from '@velobits-dev/icons';
import {
  Avatar,
  AvatarFallback,
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  useTheme,
} from '@velobits-dev/ui';
import { Link } from 'react-router-dom';

import { useAuth } from '../../auth/AuthContext';
import { useWorkspace } from '../../state/WorkspaceContext';

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
  /*
   * A subscription, not a snapshot. The old version read the DOM once into
   * `useState`, so flipping the theme from the landing page's toggle left this
   * item offering to switch to the theme already showing.
   */
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';

  const email = ws.me?.user.email ?? user?.profile.email ?? '';
  const displayName = ws.me?.user.displayName ?? email;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="hover:bg-highlight focus-visible:ring-ring group flex w-full items-center gap-2.5 rounded-md border-0 bg-transparent p-2 text-left transition-colors duration-100 focus-visible:ring-2 focus-visible:outline-none motion-reduce:transition-none"
      >
        <Avatar aria-hidden className="size-7 shrink-0">
          <AvatarFallback className="bg-primary-soft text-link text-[11px] font-semibold">
            {initials(displayName || '?')}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="text-fg block truncate text-[13px] font-medium">
            {displayName || '…'}
          </span>
          {/* Organization and role: the context every action on the page runs
              under, so it is stated permanently rather than only inside the menu. */}
          <span className="text-muted-foreground block truncate text-[11.5px]">
            {ws.org ? `${ws.org.name} · ${ws.role}` : '…'}
          </span>
        </span>
        <ChevronsUpDownIcon
          size={13}
          className="text-muted-foreground group-hover:text-fg shrink-0"
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start" className="min-w-[15rem]">
        <div className="px-2 py-1.5">
          <p className="text-fg m-0 truncate text-[13px] font-medium">{displayName}</p>
          {email && email !== displayName && (
            <p className="text-muted-foreground m-0 truncate text-[12px]">{email}</p>
          )}
        </div>
        <DropdownMenuSeparator />

        {ws.org && (
          <>
            <DropdownMenuLabel>Signed in to</DropdownMenuLabel>
            <div className="flex items-center gap-2 px-2 pb-1.5">
              <span className="text-fg min-w-0 flex-1 truncate text-[13px]">{ws.org.name}</span>
              <Badge variant="primary" className="shrink-0">
                {ws.role}
              </Badge>
            </div>
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuItem asChild onSelect={onNavigate}>
          <Link to="/settings">
            <SlidersIcon size={15} className="shrink-0" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild onSelect={onNavigate}>
          <Link to="/team">
            <UserIcon size={15} className="shrink-0" />
            Team &amp; roles
          </Link>
        </DropdownMenuItem>

        {/*
          Preventing the default select keeps the menu open, so the user can see
          the theme change and flip back without reopening - the one item here
          you might plausibly use twice in a row.
        */}
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            toggle();
          }}
        >
          {dark ? (
            <SunIcon size={15} className="shrink-0" />
          ) : (
            <MoonIcon size={15} className="shrink-0" />
          )}
          {dark ? 'Switch to light theme' : 'Switch to dark theme'}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        {/* `variant="danger"` is the system's own destructive item styling, which
            also tints correctly while highlighted — the pair of classes this used
            to carry by hand. */}
        <DropdownMenuItem variant="danger" onSelect={() => void logout()}>
          <LogOutIcon size={15} className="shrink-0" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
