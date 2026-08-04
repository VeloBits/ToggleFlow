// @vitest-environment happy-dom
/**
 * The overview: flag counts for the selected environment, the rollout list,
 * recent activity, and the first-run state an org with no projects sees.
 */
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuditEntry } from '../src/api/client';
import { HomePage } from '../src/pages/HomePage';
import {
  ENV_ID,
  ORG_ID,
  flagRow,
  renderWithProviders,
  stubAuth,
  stubFetch,
  workspaceHandlers,
  type Handlers,
} from './harness';

const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 'a1',
  actorId: 'u1',
  action: 'flag.update',
  entityType: 'flag',
  entityId: 't1',
  before: null,
  after: null,
  createdAt: new Date(Date.now() - 120_000).toISOString(),
  ...over,
});

const pageHandlers = (over: Handlers = {}): Handlers => ({
  ...workspaceHandlers(),
  [`GET /v1/environments/${ENV_ID}/flags`]: [flagRow()],
  [`GET /v1/orgs/${ORG_ID}/audit?limit=8`]: { entries: [entry()] },
  [`GET /v1/orgs/${ORG_ID}/members`]: [
    { userId: 'u1', email: 'dev@velobits.test', displayName: 'Dev User', role: 'admin' },
  ],
  ...over,
});

function renderPage(handlers: Handlers = pageHandlers()) {
  stubAuth();
  const stub = stubFetch(handlers);
  renderWithProviders(<HomePage />);
  return { stub };
}

/**
 * The environment resolves a tick after the project, and the flag counts a
 * tick after that - gating on the project name alone reads a half-built page.
 */
const ready = () => waitFor(() => expect(screen.getByText('(prod)')).toBeTruthy());

const statValue = (label: string) =>
  screen.getByText(label).parentElement?.querySelector('p')?.textContent;

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('overview', () => {
  it('names the project and the environment it is showing', async () => {
    renderPage();
    await ready();
    expect(screen.getByText('Control Plane')).toBeTruthy();
    expect(screen.getByText('Production')).toBeTruthy();
  });

  it('counts flags by state, ignoring archived ones', async () => {
    renderPage(
      pageHandlers({
        [`GET /v1/environments/${ENV_ID}/flags`]: [
          flagRow({ id: 'a' }),
          flagRow({ id: 'b', enabled: false }),
          flagRow({ id: 'c', rolloutPercent: 25 }),
          flagRow({ id: 'd', archived: true }),
        ],
      }),
    );
    // Wait for the counts themselves: the tiles render at zero while the
    // flags query is in flight, so the labels appear before the numbers mean
    // anything.
    await waitFor(() => expect(statValue('flags in this environment')).toBe('3'));
    expect(statValue('fully on')).toBe('1');
    expect(statValue('rolling out')).toBe('1');
    expect(statValue('off')).toBe('1');
  });

  it('lists what is mid-rollout with its percentage', async () => {
    renderPage(
      pageHandlers({
        [`GET /v1/environments/${ENV_ID}/flags`]: [flagRow({ rolloutPercent: 25 })],
      }),
    );
    await waitFor(() => expect(screen.getByText('25%')).toBeTruthy());
    expect(screen.getByText('tool.summarize')).toBeTruthy();
  });

  it('says so when nothing is rolling out', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Nothing mid-rollout')).toBeTruthy());
  });

  it('resolves audit actors to names and shows how long ago', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('flag.update')).toBeTruthy());
    expect(screen.getByText(/Dev User · 2 minutes ago/)).toBeTruthy();
  });

  it('falls back to the empty state when there is no activity', async () => {
    renderPage(pageHandlers({ [`GET /v1/orgs/${ORG_ID}/audit?limit=8`]: { entries: [] } }));
    await waitFor(() => expect(screen.getByText('No activity yet')).toBeTruthy());
  });
});

describe('first run', () => {
  it('asks an admin to create the first project', async () => {
    renderPage({ ...workspaceHandlers(), [`GET /v1/orgs/${ORG_ID}/projects`]: [] });
    await waitFor(() => expect(screen.getByText('Create your first project')).toBeTruthy());
    expect(screen.getByText(/Welcome, Dev User/)).toBeTruthy();
  });

  it('tells a non-admin that an admin has to go first', async () => {
    renderPage({
      ...workspaceHandlers('developer'),
      [`GET /v1/orgs/${ORG_ID}/projects`]: [],
    });
    await waitFor(() => expect(screen.getByText(/An admin needs to create/)).toBeTruthy());
  });
});
