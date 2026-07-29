// @vitest-environment happy-dom
/**
 * Audit log: actor resolution against the member list, the before/after detail
 * cell, and cursor pagination — which only offers "Load older" on a full page.
 */
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuditEntry, Member } from '../src/api/client';
import { AuditPage } from '../src/pages/AuditPage';
import {
  ORG_ID,
  dynamic,
  renderWithProviders,
  stubAuth,
  stubFetch,
  workspaceHandlers,
  type FetchStub,
  type Handlers,
} from './harness';

const AUDIT_URL = `/v1/orgs/${ORG_ID}/audit`;
const MEMBERS_URL = `/v1/orgs/${ORG_ID}/members`;

const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 'a1',
  actorId: 'u1',
  action: 'flag.update',
  entityType: 'flag_state',
  entityId: 'f1',
  before: { enabled: true },
  after: { enabled: false },
  createdAt: '2026-07-20T10:00:00.000Z',
  ...over,
});

const members: Member[] = [
  {
    userId: 'u1',
    email: 'dev@velobits.test',
    displayName: 'Dev User',
    role: 'admin',
    createdAt: '2026-07-01T00:00:00.000Z',
  },
  {
    userId: 'u2',
    email: 'ops@velobits.test',
    displayName: null,
    role: 'developer',
    createdAt: '2026-07-01T00:00:00.000Z',
  },
];

/** A full page is exactly the request limit, which is what unlocks pagination. */
const fullPage = (prefix: string) =>
  Array.from({ length: 50 }, (_, i) =>
    entry({
      id: `${prefix}-${i}`,
      action: `action.${prefix}.${i}`,
      createdAt: `2026-07-${String(20 - (i % 19)).padStart(2, '0')}T10:00:00.000Z`,
    }),
  );

const pageHandlers = (over: Handlers = {}): Handlers => ({
  ...workspaceHandlers(),
  [`GET ${AUDIT_URL}`]: { entries: [entry()] },
  [`GET ${MEMBERS_URL}`]: members,
  ...over,
});

function renderPage(handlers: Handlers = pageHandlers()): { stub: FetchStub } {
  stubAuth();
  const stub = stubFetch(handlers);
  renderWithProviders(<AuditPage />);
  return { stub };
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('listing', () => {
  it('renders the action and the before/after detail', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('flag.update')).toBeTruthy());
    expect(
      screen.getByText(JSON.stringify({ before: { enabled: true }, after: { enabled: false } })),
    ).toBeTruthy();
  });

  it('falls back to the entity type when there is no before or after', async () => {
    renderPage(
      pageHandlers({
        [`GET ${AUDIT_URL}`]: { entries: [entry({ before: null, after: null })] },
      }),
    );
    await waitFor(() => expect(screen.getByText('flag_state')).toBeTruthy());
  });

  it('shows an empty state', async () => {
    renderPage(pageHandlers({ [`GET ${AUDIT_URL}`]: { entries: [] } }));
    await waitFor(() => expect(screen.getByText('Nothing yet.')).toBeTruthy());
  });

  it('surfaces a load failure', async () => {
    renderPage(
      pageHandlers({
        [`GET ${AUDIT_URL}`]: { status: 403, body: { error: 'forbidden', message: 'no audit' } },
      }),
    );
    await waitFor(() => expect(screen.getByText('no audit')).toBeTruthy());
  });
});

describe('actor resolution', () => {
  it('prefers the display name', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Dev User')).toBeTruthy());
  });

  it('falls back to the email when there is no display name', async () => {
    renderPage(pageHandlers({ [`GET ${AUDIT_URL}`]: { entries: [entry({ actorId: 'u2' })] } }));
    await waitFor(() => expect(screen.getByText('ops@velobits.test')).toBeTruthy());
  });

  it('shows a truncated id for an actor who is no longer a member', async () => {
    renderPage(
      pageHandlers({
        [`GET ${AUDIT_URL}`]: { entries: [entry({ actorId: 'deadbeef-gone-forever' })] },
      }),
    );
    await waitFor(() => expect(screen.getByText('deadbeef')).toBeTruthy());
  });

  it('attributes a null actor to the system', async () => {
    renderPage(pageHandlers({ [`GET ${AUDIT_URL}`]: { entries: [entry({ actorId: null })] } }));
    await waitFor(() => expect(screen.getByText('system')).toBeTruthy());
  });
});

describe('pagination', () => {
  it('offers no Load older on a partial page', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('flag.update')).toBeTruthy());
    expect(screen.queryByText('Load older')).toBeNull();
  });

  it('pages with a before cursor and keeps earlier pages on screen', async () => {
    const first = fullPage('first');
    const oldest = first.at(-1)!;
    const { stub } = renderPage(
      pageHandlers({
        [`GET ${AUDIT_URL}`]: dynamic(({ url }) =>
          url.includes('before=')
            ? { entries: [entry({ id: 'older-1', action: 'older.action' })] }
            : { entries: first },
        ),
        [`GET ${MEMBERS_URL}`]: members,
      }),
    );

    await waitFor(() => expect(screen.getByText('Load older')).toBeTruthy());
    fireEvent.click(screen.getByText('Load older'));

    await waitFor(() => expect(screen.getByText('older.action')).toBeTruthy());
    // The first page is retained above the newly fetched one.
    expect(screen.getByText('action.first.0')).toBeTruthy();
    // The cursor is the createdAt of the last row of the previous page.
    expect(
      stub.calls.some((c) => c.key.includes(`before=${encodeURIComponent(oldest.createdAt)}`)),
    ).toBe(true);
    // A short second page ends pagination.
    expect(screen.queryByText('Load older')).toBeNull();
  });
});
