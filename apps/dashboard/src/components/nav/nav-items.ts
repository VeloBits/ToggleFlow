/**
 * The sidebar's contents, as data.
 *
 * Kept out of the component so the routes in App.tsx and the rows in the rail
 * can be read side by side - a nav item with no route is a dead link, and that
 * is much easier to spot in a list than in JSX.
 *
 * The grouping is ToggleFlow's own scope model rather than a copy of any other
 * product's sidebar: everything under "Project" is scoped by the project and
 * environment chosen in the top bar, everything under "Organization" is not.
 * That line is the one users get wrong, so the sidebar draws it.
 */
import type { ComponentType } from 'react';

import {
  CreditCardIcon,
  FilterIcon,
  FlagIcon,
  HistoryIcon,
  HomeIcon,
  KeyIcon,
  LayersIcon,
  PlugIcon,
  SearchIcon,
  SlidersIcon,
  UsersIcon,
  WebhookIcon,
  type IconProps,
} from '../../ui/icons';

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<IconProps>;
  /** `end` on NavLink, so "/" is not active for every child route. */
  end?: boolean;
  /**
   * Surfaces whose backend does not exist yet. They route to a real page that
   * says so, and the rail marks them, rather than looking live and doing
   * nothing when clicked.
   */
  soon?: boolean;
}

export interface NavSection {
  /** Undefined for the primary group, which is above the first divider. */
  label?: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { to: '/', label: 'Home', icon: HomeIcon, end: true },
      { to: '/search', label: 'Search', icon: SearchIcon },
    ],
  },
  {
    label: 'Project',
    items: [
      { to: '/flags', label: 'Feature flags', icon: FlagIcon },
      { to: '/segments', label: 'Segments', icon: FilterIcon },
      { to: '/environments', label: 'Environments', icon: LayersIcon },
      { to: '/keys', label: 'API keys', icon: KeyIcon },
      { to: '/audit', label: 'Audit log', icon: HistoryIcon },
      { to: '/webhooks', label: 'Webhooks', icon: WebhookIcon, soon: true },
      { to: '/integrations', label: 'Integrations', icon: PlugIcon, soon: true },
    ],
  },
  {
    label: 'Organization',
    items: [
      { to: '/team', label: 'Team', icon: UsersIcon },
      { to: '/billing', label: 'Billing', icon: CreditCardIcon, soon: true },
      { to: '/settings', label: 'Settings', icon: SlidersIcon },
    ],
  },
];

/** Flat list, for tests and for the route table to check itself against. */
export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);
