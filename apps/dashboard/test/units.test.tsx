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

import type { FlagRow } from '../src/api/client';
import { returnToFromState, safeReturnTo } from '../src/auth/return-to';
import { diffLines } from '../src/components/diff';
import { ConfirmButton, StatusChip } from '../src/components/ui';
import { GuestHomePage } from '../src/pages/GuestHomePage';
import { EMPTY_FILTER, filterRows } from '../src/pages/tools-filter';

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

describe('filterRows', () => {
  const row = (over: Partial<FlagRow & { tags: string[] }>): FlagRow & { tags: string[] } => ({
    toolId: 't',
    toolKey: 'tool.x',
    toolName: 'X',
    archived: false,
    enabled: true,
    rolloutPercent: null,
    targetingRules: [],
    updatedAt: '2026-01-01T00:00:00Z',
    tags: [],
    ...over,
  });
  const rows = [
    row({ toolId: '1', toolKey: 'tool.summarize', toolName: 'Summarize', tags: ['ai'] }),
    row({ toolId: '2', toolKey: 'tool.translate', toolName: 'Translate', enabled: false }),
    row({ toolId: '3', toolKey: 'tool.rollout', toolName: 'Rollout', rolloutPercent: 25 }),
    row({ toolId: '4', toolKey: 'tool.old', toolName: 'Old', archived: true }),
  ];

  it('hides archived by default and finds by key or name', () => {
    expect(filterRows(rows, EMPTY_FILTER)).toHaveLength(3);
    expect(filterRows(rows, { ...EMPTY_FILTER, includeArchived: true })).toHaveLength(4);
    expect(filterRows(rows, { ...EMPTY_FILTER, search: 'SUMM' })).toHaveLength(1);
    expect(filterRows(rows, { ...EMPTY_FILTER, search: 'translate' })[0]!.toolId).toBe('2');
  });

  it('filters by status and tag', () => {
    expect(filterRows(rows, { ...EMPTY_FILTER, status: 'on' }).map((r) => r.toolId)).toEqual(['1']);
    expect(filterRows(rows, { ...EMPTY_FILTER, status: 'off' }).map((r) => r.toolId)).toEqual([
      '2',
    ]);
    expect(filterRows(rows, { ...EMPTY_FILTER, status: 'rollout' }).map((r) => r.toolId)).toEqual([
      '3',
    ]);
    expect(filterRows(rows, { ...EMPTY_FILTER, tag: 'ai' }).map((r) => r.toolId)).toEqual(['1']);
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
    expect(safeReturnTo('/tools/abc')).toBe('/tools/abc');
    expect(safeReturnTo('/audit?actor=ns')).toBe('/audit?actor=ns');
  });

  it('rejects external, non-path, and callback targets', () => {
    expect(safeReturnTo('//evil.example.com')).toBe('/');
    expect(safeReturnTo('/\\evil.example.com')).toBe('/');
    expect(safeReturnTo('https://evil.example.com')).toBe('/');
    expect(safeReturnTo('tools/abc')).toBe('/');
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
    // Nav, hero, closing section, footer — sign-up is reachable from four places
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
    renderAt('/tools/abc?env=prod');
    fireEvent.click(screen.getAllByText('Get started free')[0]!);
    expect(auth.signup).toHaveBeenCalledWith('/tools/abc?env=prod');
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
    renderAt('/tools/abc?env=prod');
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    const menu = document.getElementById('mobile-menu')!;
    const getStarted = [...menu.querySelectorAll('button')].find(
      (button) => button.textContent === 'Get started free',
    )!;
    fireEvent.click(getStarted);
    expect(auth.signup).toHaveBeenCalledWith('/tools/abc?env=prod');
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
  // one of the three drifts — a nav chip just silently scrolls nowhere.
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
    renderAt('/tools/abc?env=prod');
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
    expect(auth.signup).toHaveBeenCalledWith('/tools/abc?env=prod');
  });

  // The accordion's own behaviour is covered in test/accordion.test.tsx; this is
  // the wiring — that the FAQ reaches it, opens on exactly one item, and that
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
