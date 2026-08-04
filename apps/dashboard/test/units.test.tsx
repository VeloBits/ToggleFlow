// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);

// The guest home only needs the auth actions; stubbing the context keeps the
// test off the real UserManager (network + storage).
const auth = vi.hoisted(() => ({ login: vi.fn(), signup: vi.fn() }));
vi.mock('../src/auth/AuthContext', () => ({
  useAuth: () => ({ user: null, loading: false, logout: vi.fn(), ...auth }),
}));

import type { Flag } from '../src/api/client';
import { flagKeys } from '../src/api/flags';
import { returnToFromState, safeReturnTo } from '../src/auth/return-to';
import { diffLines } from '../src/components/diff';
import { ConfirmButton, StatusChip } from '../src/components/ui';
import { EMPTY_FILTER, filterFlags } from '../src/features/flags/flags-filter';
import { GuestHomePage } from '../src/pages/GuestHomePage';
import { relativeTime } from '../src/ui/relative-time';
import {
  ENVIRONMENT_KEY_PATTERN,
  FLAG_KEY_PATTERN,
  slugifyEnvironmentKey,
  slugifyFlagKey,
} from '../src/ui/slug';

describe('diffLines', () => {
  it('marks added, removed, and unchanged lines', () => {
    const before = '{\n  "limit": 5,\n  "mode": "a"\n}';
    const after = '{\n  "limit": 9,\n  "mode": "a"\n}';
    const diff = diffLines(before, after);
    expect(diff.filter((l) => l.kind === 'removed').map((l) => l.text)).toEqual(['  "limit": 5,']);
    expect(diff.filter((l) => l.kind === 'added').map((l) => l.text)).toEqual(['  "limit": 9,']);
    expect(diff.filter((l) => l.kind === 'same')).toHaveLength(3);
  });

  it('handles pure additions and identical inputs', () => {
    expect(diffLines('a', 'a').every((l) => l.kind === 'same')).toBe(true);
    expect(diffLines('a', 'a\nb').filter((l) => l.kind === 'added')).toHaveLength(1);
  });
});

describe('filterFlags', () => {
  type Row = Flag & { tags: string[]; description: string | null };
  const row = (over: Partial<Row>): Row => ({
    id: 't',
    key: 'tool.x',
    name: 'X',
    archived: false,
    enabled: true,
    rolloutPercent: null,
    targetingRules: [],
    valueType: 'boolean',
    enumOptions: [],
    value: null,
    defaultValue: null,
    updatedAt: '2026-01-01T00:00:00Z',
    tags: [],
    description: null,
    ...over,
  });
  const rows = [
    row({
      id: '1',
      key: 'tool.summarize',
      name: 'Summarize',
      tags: ['ai'],
      description: 'Shortens long text',
    }),
    row({ id: '2', key: 'tool.translate', name: 'Translate', enabled: false, valueType: 'string' }),
    row({
      id: '3',
      key: 'tool.rollout',
      name: 'Rollout',
      rolloutPercent: 25,
      valueType: 'string_enum',
      enumOptions: ['fast', 'slow'],
    }),
    row({ id: '4', key: 'tool.old', name: 'Old', archived: true }),
  ];
  const ids = (filter: Parameters<typeof filterFlags>[1]) =>
    filterFlags(rows, filter).map((r) => r.id);

  it('hides archived by default and finds by key or name', () => {
    expect(filterFlags(rows, EMPTY_FILTER)).toHaveLength(3);
    expect(filterFlags(rows, { ...EMPTY_FILTER, includeArchived: true })).toHaveLength(4);
    expect(filterFlags(rows, { ...EMPTY_FILTER, search: 'SUMM' })).toHaveLength(1);
    expect(ids({ ...EMPTY_FILTER, search: 'translate' })).toEqual(['2']);
  });

  it('searches the description too, where a row carries one', () => {
    expect(ids({ ...EMPTY_FILTER, search: 'shortens' })).toEqual(['1']);
  });

  it('filters by status and tag', () => {
    expect(ids({ ...EMPTY_FILTER, status: 'on' })).toEqual(['1']);
    expect(ids({ ...EMPTY_FILTER, status: 'off' })).toEqual(['2']);
    expect(ids({ ...EMPTY_FILTER, status: 'rollout' })).toEqual(['3']);
    expect(ids({ ...EMPTY_FILTER, tag: 'ai' })).toEqual(['1']);
  });

  it('treats a row with no join as having no tags and no description', () => {
    /*
     * `tags` and `description` come from the definitions query, which resolves
     * separately from the flag list. So for one render the rows legitimately
     * have neither, and the filter has to answer "no match" rather than throw -
     * the alternative is a page that crashes for the moment between two
     * responses.
     */
    const unjoined = [{ ...rows[0]!, tags: undefined, description: undefined }];
    expect(filterFlags(unjoined, { ...EMPTY_FILTER, tag: 'ai' })).toEqual([]);
    expect(filterFlags(unjoined, { ...EMPTY_FILTER, search: 'shortens' })).toEqual([]);
    expect(filterFlags(unjoined, EMPTY_FILTER)).toHaveLength(1);
  });

  it('filters by value type', () => {
    expect(ids({ ...EMPTY_FILTER, valueType: 'boolean' })).toEqual(['1']);
    expect(ids({ ...EMPTY_FILTER, valueType: 'string' })).toEqual(['2']);
    expect(ids({ ...EMPTY_FILTER, valueType: 'string_enum' })).toEqual(['3']);
    // The axis is independent of the others: a string flag that is off stays a
    // match for `off`, and stops being one for `on`.
    expect(ids({ ...EMPTY_FILTER, valueType: 'string', status: 'off' })).toEqual(['2']);
    expect(ids({ ...EMPTY_FILTER, valueType: 'string', status: 'on' })).toEqual([]);
  });
});

/*
 * The cache keys are asserted literally rather than through the factories,
 * because their whole job is to be stable: WorkspaceContext invalidates the
 * `['flags']` prefix after creating an inherited environment, and four screens
 * share the per-environment entry. A key that changed shape would leave every
 * one of them rendering pre-mutation data - with no error to notice.
 */
describe('flagKeys', () => {
  it('keeps the list key under the prefix the workspace invalidates', () => {
    expect(flagKeys.listPrefix).toEqual(['flags']);
    expect(flagKeys.list('env-1')).toEqual(['flags', 'env-1']);
    expect(flagKeys.list(null)).toEqual(['flags', null]);
  });

  it('namespaces the definition, detail and config entries', () => {
    expect(flagKeys.definitionsPrefix).toEqual(['flag-definitions']);
    expect(flagKeys.definitions('p1')).toEqual(['flag-definitions', 'p1']);
    expect(flagKeys.detail('f1')).toEqual(['flag', 'f1']);
    expect(flagKeys.config('env-1', 'f1')).toEqual(['config', 'env-1', 'f1']);
    expect(flagKeys.configVersions('env-1', 'f1')).toEqual(['config-versions', 'env-1', 'f1']);
  });
});

describe('relativeTime', () => {
  const ago = (ms: number) => relativeTime(new Date(Date.now() - ms).toISOString());
  const MINUTE = 60_000;
  const DAY = 24 * 60 * MINUTE;

  it('lands on the largest unit the gap fills', () => {
    expect(ago(30_000)).toBe('30 seconds ago');
    expect(ago(2 * MINUTE)).toBe('2 minutes ago');
    expect(ago(3 * 60 * MINUTE)).toBe('3 hours ago');
    expect(ago(2 * DAY)).toBe('2 days ago');
    expect(ago(21 * DAY)).toBe('3 weeks ago');
    expect(ago(152 * DAY)).toBe('5 months ago');
  });

  it('prints a date once "ago" stops meaning anything', () => {
    const iso = new Date(Date.now() - 1095 * DAY).toISOString();
    expect(relativeTime(iso)).toBe(new Date(iso).toLocaleDateString());
  });
});

describe('slugify', () => {
  it('derives an environment key that its own pattern accepts', () => {
    expect(slugifyEnvironmentKey('Load Testing')).toBe('load-testing');
    expect(slugifyEnvironmentKey('  EU / West  ')).toBe('eu-west');
    expect(slugifyEnvironmentKey('checkout.v2')).toBe('checkout-v2');
    for (const name of ['Load Testing', 'EU / West', 'checkout.v2']) {
      expect(ENVIRONMENT_KEY_PATTERN.test(slugifyEnvironmentKey(name))).toBe(true);
    }
  });

  it('keeps the dots and underscores a flag key is allowed to namespace with', () => {
    expect(slugifyFlagKey('checkout.v2')).toBe('checkout.v2');
    expect(slugifyFlagKey('AI model_name')).toBe('ai-model_name');
    expect(slugifyFlagKey('Checkout v2!')).toBe('checkout-v2');
    // A leading separator is trimmed, because neither pattern allows one.
    expect(slugifyFlagKey('.hidden')).toBe('hidden');
    for (const name of ['checkout.v2', 'AI model_name', 'Checkout v2!', '.hidden']) {
      expect(FLAG_KEY_PATTERN.test(slugifyFlagKey(name))).toBe(true);
    }
  });

  it('truncates at 50 characters', () => {
    expect(slugifyEnvironmentKey('a'.repeat(80))).toHaveLength(50);
  });
});

describe('StatusChip', () => {
  it('renders ON / OFF / percentage', () => {
    const { rerender } = render(<StatusChip enabled={true} rolloutPercent={null} />);
    expect(screen.getByText('ON')).toBeTruthy();
    rerender(<StatusChip enabled={false} rolloutPercent={null} />);
    expect(screen.getByText('OFF')).toBeTruthy();
    rerender(<StatusChip enabled={true} rolloutPercent={25} />);
    expect(screen.getByText('25%')).toBeTruthy();
  });
});

describe('ConfirmButton', () => {
  it('requires a second click when confirmation is on', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmButton label="Turn OFF" confirmLabel="Sure?" onConfirm={onConfirm} requireConfirm />,
    );
    fireEvent.click(screen.getByText('Turn OFF'));
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Sure?'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('fires immediately when confirmation is off (non-prod)', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmButton
        label="Turn OFF"
        confirmLabel="Sure?"
        onConfirm={onConfirm}
        requireConfirm={false}
      />,
    );
    fireEvent.click(screen.getByText('Turn OFF'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

describe('safeReturnTo', () => {
  it('keeps in-app paths', () => {
    expect(safeReturnTo('/flags/abc')).toBe('/flags/abc');
    expect(safeReturnTo('/audit?actor=ns')).toBe('/audit?actor=ns');
  });

  it('rejects external, non-path, and callback targets', () => {
    expect(safeReturnTo('//evil.example.com')).toBe('/');
    expect(safeReturnTo('/\\evil.example.com')).toBe('/');
    expect(safeReturnTo('https://evil.example.com')).toBe('/');
    expect(safeReturnTo('flags/abc')).toBe('/');
    expect(safeReturnTo(undefined)).toBe('/');
    expect(safeReturnTo('/auth/callback')).toBe('/');
  });

  it('reads the path out of the oidc state', () => {
    expect(returnToFromState({ returnTo: '/segments' })).toBe('/segments');
    expect(returnToFromState({})).toBe('/');
    expect(returnToFromState(null)).toBe('/');
  });
});

describe('GuestHomePage', () => {
  beforeEach(() => {
    auth.login.mockClear();
    auth.signup.mockClear();
    // happy-dom keeps one document per file, so scroll offset and the fragment
    // would leak between cases.
    window.scroll({ top: 0 });
    window.history.replaceState(null, '', '/');
  });

  const renderAt = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <GuestHomePage />
      </MemoryRouter>,
    );

  it('is the landing page, and sign-up is its only auth entry point', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Ship faster');
    // Sign in is gone from the nav and the footer: there is no /login screen, and
    // the hosted IdP walks returning users through the same authorize call, so a
    // second near-equal button only split the click.
    expect(screen.queryByText('Sign in')).toBeNull();
    // Nav, hero, closing section, footer - sign-up is reachable from four places
    // and every one of them has to carry the path, not just the first.
    const ctas = screen.getAllByText('Get started free');
    expect(ctas.length).toBe(4);
    for (const cta of ctas) {
      auth.signup.mockClear();
      fireEvent.click(cta);
      expect(auth.signup).toHaveBeenCalledWith('/');
    }
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('carries the requested path into sign-up so deep links survive', () => {
    renderAt('/flags/abc?env=prod');
    fireEvent.click(screen.getAllByText('Get started free')[0]!);
    expect(auth.signup).toHaveBeenCalledWith('/flags/abc?env=prod');
  });

  it('weights the nav island past 40px of scroll', () => {
    renderAt('/');
    const island = document.getElementById('site-nav')!;
    expect(island.getAttribute('data-scrolled')).toBe('false');
    window.scroll({ top: 120 });
    fireEvent.scroll(window);
    expect(island.getAttribute('data-scrolled')).toBe('true');
    window.scroll({ top: 10 });
    fireEvent.scroll(window);
    expect(island.getAttribute('data-scrolled')).toBe('false');
  });

  it('opens the mobile menu, then closes it on Escape and restores focus', () => {
    renderAt('/');
    const toggle = screen.getByRole('button', { name: 'Open navigation menu' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe('mobile-menu');
    expect(document.getElementById('mobile-menu')).toBeNull();

    fireEvent.click(toggle);
    const menu = document.getElementById('mobile-menu')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Close navigation menu');
    expect([...menu.querySelectorAll('a')].map((link) => link.getAttribute('href'))).toEqual([
      '#features',
      '#how',
      '#use-cases',
      '#faq',
    ]);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.getElementById('mobile-menu')).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });

  it('closes the mobile menu on an outside mousedown but not an inside one', () => {
    renderAt('/');
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    fireEvent.mouseDown(document.getElementById('mobile-menu')!);
    expect(document.getElementById('mobile-menu')).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(document.getElementById('mobile-menu')).toBeNull();
  });

  it('carries the requested path from inside the mobile menu', () => {
    renderAt('/flags/abc?env=prod');
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    const menu = document.getElementById('mobile-menu')!;
    const getStarted = [...menu.querySelectorAll('button')].find(
      (button) => button.textContent === 'Get started free',
    )!;
    fireEvent.click(getStarted);
    expect(auth.signup).toHaveBeenCalledWith('/flags/abc?env=prod');
    expect(document.getElementById('mobile-menu')).toBeNull();
  });

  it('marks the section the visitor jumped to with aria-current', () => {
    renderAt('/');
    const island = document.getElementById('site-nav')!;
    const features = island.querySelector('a[href="#features"]')!;
    const how = island.querySelector('a[href="#how"]')!;
    expect(features.getAttribute('aria-current')).toBeNull();
    fireEvent.click(features);
    expect(features.getAttribute('aria-current')).toBe('location');
    expect(how.getAttribute('aria-current')).toBeNull();
  });

  // GuestNav and GuestFooter hardcode hrefs that only resolve because
  // GuestHomePage names its sections to match. Nothing else fails loudly when
  // one of the three drifts - a nav chip just silently scrolls nowhere.
  it('points every in-page nav and footer anchor at a section that exists', () => {
    renderAt('/');
    const hrefs = [...document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')]
      .map((link) => link.getAttribute('href')!)
      // '#' is the Legal placeholder pair in the footer, pending real routes.
      .filter((href) => href !== '#');
    expect(hrefs).toContain('#use-cases');
    expect(hrefs).toContain('#faq');
    for (const href of hrefs) {
      expect(document.getElementById(href.slice(1)), `${href} has no target`).toBeTruthy();
    }
  });

  it('renders the footer link groups and carries the path into its CTA', () => {
    renderAt('/flags/abc?env=prod');
    const footer = document.querySelector('footer')!;
    expect([...footer.querySelectorAll('h2')].map((heading) => heading.textContent)).toEqual([
      'Product',
      'Developers',
      'Company',
      'Legal',
    ]);
    const cta = [...footer.querySelectorAll('button')].find(
      (button) => button.textContent === 'Get started free',
    )!;
    fireEvent.click(cta);
    expect(auth.signup).toHaveBeenCalledWith('/flags/abc?env=prod');
  });

  // The accordion's own behaviour is covered in test/accordion.test.tsx; this is
  // the wiring - that the FAQ reaches it, opens on exactly one item, and that
  // every answer is still in the HTML for a crawler even while collapsed.
  it('renders the FAQ as an accordion with one item open', () => {
    renderAt('/');
    const faq = document.getElementById('faq')!;
    const triggers = [...faq.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')];
    expect(triggers.length).toBe(7);
    expect(triggers.filter((trigger) => trigger.getAttribute('aria-expanded') === 'true')).toEqual([
      triggers[0],
    ]);
    expect(triggers[0]!.textContent).toContain('What are feature flags?');
    // Collapsed answers stay in the DOM: this page is the SPA's only crawlable surface.
    expect(faq.textContent).toContain('There is a free tier');

    fireEvent.click(triggers[4]!);
    expect(triggers[4]!.getAttribute('aria-expanded')).toBe('true');
    expect(triggers[0]!.getAttribute('aria-expanded')).toBe('false');
  });
});
