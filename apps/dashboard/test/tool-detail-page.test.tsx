// @vitest-environment happy-dom
/**
 * The tool detail screen: kill switch (with the prod confirm gate), rollout,
 * targeting-rule validation, config save, and version history / diff /
 * rollback.
 */
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConfigVersion, FlagRow, Tool, ToolConfig } from '../src/api/client';
import { ToolDetailPage } from '../src/pages/ToolDetailPage';
import {
  ENV_ID,
  renderWithProviders,
  stubAuth,
  stubFetch,
  workspaceHandlers,
  type FetchStub,
  type Handlers,
} from './harness';

const TOOL_ID = 't1';
const PROD_ENV = '44444444-4444-4444-8444-444444444444';
const CONFIG_BASE = (envId = ENV_ID) => `/v1/environments/${envId}/tools/${TOOL_ID}/config`;

const toolDetail = (over: Partial<Tool> = {}) => ({
  id: TOOL_ID,
  key: 'tool.summarize',
  name: 'Summarize',
  description: 'Shortens text',
  tags: ['text'],
  metadata: {},
  archived: false,
  updatedAt: '2026-07-20T10:00:00.000Z',
  flagStates: [],
  ...over,
});

const flagRow = (over: Partial<FlagRow> = {}): FlagRow => ({
  toolId: TOOL_ID,
  toolKey: 'tool.summarize',
  toolName: 'Summarize',
  archived: false,
  enabled: true,
  rolloutPercent: null,
  targetingRules: [],
  updatedAt: '2026-07-20T10:00:00.000Z',
  ...over,
});

const config = (over: Partial<ToolConfig> = {}): ToolConfig => ({
  value: { limit: 5, mode: 'fast' },
  version: 3,
  ...over,
});

const version = (v: number, over: Partial<ConfigVersion> = {}): ConfigVersion => ({
  id: `cv-${v}`,
  version: v,
  value: { limit: v, mode: 'fast' },
  authorId: 'u1',
  restoredFromVersion: null,
  createdAt: '2026-07-20T10:00:00.000Z',
  ...over,
});

const pageHandlers = (
  role: 'admin' | 'developer' | 'viewer' = 'admin',
  over: Handlers = {},
  envId = ENV_ID,
): Handlers => ({
  ...workspaceHandlers(role),
  [`GET /v1/tools/${TOOL_ID}`]: toolDetail(),
  [`GET /v1/environments/${envId}/flags`]: [flagRow()],
  [`GET ${CONFIG_BASE(envId)}`]: config(),
  [`GET ${CONFIG_BASE(envId)}/versions`]: [version(3), version(2)],
  ...over,
});

/**
 * Mounted under a real route: the page reads :toolId from useParams and
 * early-returns null without one, so rendering it bare shows nothing at all.
 */
function renderPage(handlers: Handlers = pageHandlers()): { stub: FetchStub } {
  stubAuth();
  const stub = stubFetch(handlers);
  renderWithProviders(
    <Routes>
      <Route path="/tools/:toolId" element={<ToolDetailPage />} />
      <Route path="/tools" element={<ToolDetailPage />} />
    </Routes>,
    { route: `/tools/${TOOL_ID}` },
  );
  return { stub };
}

const loaded = () => waitFor(() => expect(screen.getByText('tool.summarize')).toBeTruthy());
/**
 * Positive gate on both panels. Waiting for "Loading flag state…" to DISAPPEAR
 * would pass instantly on the first render, before the tool query has even
 * resolved — that text is absent before the panel exists, not only after.
 */
const flagReady = () =>
  waitFor(() => {
    expect(screen.getByText(/Flag state in/)).toBeTruthy();
    expect(screen.getByLabelText('Config value')).toBeTruthy();
  });

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('header', () => {
  it('renders key, name, description, and tags', async () => {
    renderPage();
    await loaded();
    expect(screen.getByText(/Summarize — Shortens text/)).toBeTruthy();
    expect(screen.getByText('text')).toBeTruthy();
  });

  it('omits the em dash when there is no description', async () => {
    renderPage(
      pageHandlers('admin', { [`GET /v1/tools/${TOOL_ID}`]: toolDetail({ description: null }) }),
    );
    await loaded();
    expect(screen.queryByText(/—/)).toBeNull();
  });

  it('shows a loading state, then the tool', async () => {
    renderPage();
    expect(screen.getByText('Loading…')).toBeTruthy();
    await loaded();
  });

  it('renders the error instead of the page when the tool fails to load', async () => {
    renderPage(
      pageHandlers('admin', {
        [`GET /v1/tools/${TOOL_ID}`]: {
          status: 404,
          body: { error: 'not_found', message: 'tool not found' },
        },
      }),
    );
    await waitFor(() => expect(screen.getByText('tool not found')).toBeTruthy());
    expect(screen.queryByText('Config')).toBeNull();
  });
});

describe('archive', () => {
  it('archives after a confirm and refetches', async () => {
    const { stub } = renderPage(
      pageHandlers('admin', { [`PATCH /v1/tools/${TOOL_ID}`]: { ok: true } }),
    );
    await loaded();

    fireEvent.click(screen.getByText('Archive'));
    fireEvent.click(screen.getByText('Archive (drops from snapshots)?'));

    await waitFor(() =>
      expect(stub.calls.find((c) => c.key === `PATCH /v1/tools/${TOOL_ID}`)?.body).toEqual({
        archived: true,
      }),
    );
  });

  it('offers unarchive for an archived tool and marks it', async () => {
    const { stub } = renderPage(
      pageHandlers('admin', {
        [`GET /v1/tools/${TOOL_ID}`]: toolDetail({ archived: true }),
        [`PATCH /v1/tools/${TOOL_ID}`]: { ok: true },
      }),
    );
    await loaded();
    expect(screen.getByText('archived')).toBeTruthy();

    fireEvent.click(screen.getByText('Unarchive'));
    fireEvent.click(screen.getByText('Unarchive?'));
    await waitFor(() =>
      expect(stub.calls.find((c) => c.key === `PATCH /v1/tools/${TOOL_ID}`)?.body).toEqual({
        archived: false,
      }),
    );
  });

  it('hides archive from a viewer', async () => {
    renderPage(pageHandlers('viewer'));
    await loaded();
    expect(screen.queryByText('Archive')).toBeNull();
  });
});

describe('flag panel', () => {
  it('shows the current state and flips the kill switch without confirming in dev', async () => {
    const { stub } = renderPage(
      pageHandlers('admin', {
        [`PATCH /v1/environments/${ENV_ID}/tools/${TOOL_ID}/flag`]: { ok: true },
      }),
    );
    await flagReady();
    expect(screen.getByText('Flag state in Development')).toBeTruthy();

    // requireConfirm is false outside prod, so one click is enough.
    fireEvent.click(screen.getByText('Turn OFF (kill switch)'));
    await waitFor(() =>
      expect(
        stub.calls.find((c) => c.key === `PATCH /v1/environments/${ENV_ID}/tools/${TOOL_ID}/flag`)
          ?.body,
      ).toEqual({ enabled: false }),
    );
  });

  it('requires a second click in prod', async () => {
    localStorage.setItem('tf.environment', PROD_ENV);
    const { stub } = renderPage(
      pageHandlers(
        'admin',
        { [`PATCH /v1/environments/${PROD_ENV}/tools/${TOOL_ID}/flag`]: { ok: true } },
        PROD_ENV,
      ),
    );
    await flagReady();
    expect(screen.getByText('production changes ask for confirmation')).toBeTruthy();

    fireEvent.click(screen.getByText('Turn OFF (kill switch)'));
    expect(stub.calls.some((c) => c.key.startsWith('PATCH'))).toBe(false);

    fireEvent.click(screen.getByText('Confirm OFF in prod?'));
    await waitFor(() => expect(stub.calls.some((c) => c.key.startsWith('PATCH'))).toBe(true));
  });

  it('offers Turn ON for a disabled tool', async () => {
    renderPage(
      pageHandlers('admin', {
        [`GET /v1/environments/${ENV_ID}/flags`]: [flagRow({ enabled: false })],
      }),
    );
    await flagReady();
    expect(screen.getByText('Turn ON')).toBeTruthy();
  });

  it('pre-fills the rollout and saves it as a number', async () => {
    const { stub } = renderPage(
      pageHandlers('admin', {
        [`GET /v1/environments/${ENV_ID}/flags`]: [flagRow({ rolloutPercent: 25 })],
        [`PATCH /v1/environments/${ENV_ID}/tools/${TOOL_ID}/flag`]: { ok: true },
      }),
    );
    await flagReady();
    expect(screen.getByLabelText(/Rollout %/)).toHaveProperty('value', '25');

    fireEvent.change(screen.getByLabelText(/Rollout %/), { target: { value: '60' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() =>
      expect(stub.calls.find((c) => c.key.endsWith('/flag'))?.body).toEqual({ rolloutPercent: 60 }),
    );
  });

  it('sends null when the rollout is cleared — empty means everyone', async () => {
    const { stub } = renderPage(
      pageHandlers('admin', {
        [`GET /v1/environments/${ENV_ID}/flags`]: [flagRow({ rolloutPercent: 25 })],
        [`PATCH /v1/environments/${ENV_ID}/tools/${TOOL_ID}/flag`]: { ok: true },
      }),
    );
    await flagReady();

    fireEvent.change(screen.getByLabelText(/Rollout %/), { target: { value: '' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() =>
      expect(
        (stub.calls.find((c) => c.key.endsWith('/flag'))?.body as { rolloutPercent: unknown })
          .rolloutPercent,
      ).toBeNull(),
    );
  });

  it('rejects malformed JSON in the targeting field without calling the API', async () => {
    const { stub } = renderPage();
    await flagReady();

    fireEvent.change(screen.getByLabelText(/Targeting rules/), { target: { value: '{oops' } });
    fireEvent.click(screen.getByText('Save targeting + rollout'));

    expect(screen.getByText('Not valid JSON.')).toBeTruthy();
    expect(stub.calls.some((c) => c.key.startsWith('PATCH'))).toBe(false);
  });

  it('reports schema violations with a field path', async () => {
    const { stub } = renderPage();
    await flagReady();

    // Valid JSON, but `enabled` is required on a targeting rule.
    fireEvent.change(screen.getByLabelText(/Targeting rules/), {
      target: { value: '[{"segments":["beta"]}]' },
    });
    fireEvent.click(screen.getByText('Save targeting + rollout'));

    await waitFor(() => expect(screen.getByText(/0\.enabled/)).toBeTruthy());
    expect(stub.calls.some((c) => c.key.startsWith('PATCH'))).toBe(false);
  });

  it('saves valid targeting rules together with the rollout', async () => {
    const { stub } = renderPage(
      pageHandlers('admin', {
        [`PATCH /v1/environments/${ENV_ID}/tools/${TOOL_ID}/flag`]: { ok: true },
      }),
    );
    await flagReady();

    fireEvent.change(screen.getByLabelText(/Targeting rules/), {
      target: { value: '[{"segments":["beta"],"enabled":true}]' },
    });
    fireEvent.click(screen.getByText('Save targeting + rollout'));

    await waitFor(() => expect(stub.calls.some((c) => c.key.endsWith('/flag'))).toBe(true));
    expect(stub.calls.find((c) => c.key.endsWith('/flag'))?.body).toEqual({
      targetingRules: [{ segments: ['beta'], conditions: [], enabled: true }],
      rolloutPercent: null,
    });
  });

  it('surfaces a rejected flag patch', async () => {
    renderPage(
      pageHandlers('admin', {
        [`PATCH /v1/environments/${ENV_ID}/tools/${TOOL_ID}/flag`]: {
          status: 403,
          body: { error: 'forbidden', message: 'role too low' },
        },
      }),
    );
    await flagReady();

    fireEvent.click(screen.getByText('Turn OFF (kill switch)'));
    await waitFor(() => expect(screen.getByText('role too low')).toBeTruthy());
  });

  it('is read-only for a viewer', async () => {
    renderPage(pageHandlers('viewer'));
    await flagReady();
    expect(screen.getByLabelText(/Rollout %/)).toHaveProperty('disabled', true);
    expect(screen.queryByText('Save targeting + rollout')).toBeNull();
    expect(screen.queryByText('Turn OFF (kill switch)')).toBeNull();
  });

  it('is read-only for an archived tool even as admin', async () => {
    renderPage(
      pageHandlers('admin', { [`GET /v1/tools/${TOOL_ID}`]: toolDetail({ archived: true }) }),
    );
    await flagReady();
    // canEdit is `canEdit && !tool.archived` for the flag panel only.
    expect(screen.queryByText('Turn OFF (kill switch)')).toBeNull();
    expect(screen.getByText(/Save as version/)).toBeTruthy();
  });

  it('keeps showing the loading panel when the tool has no flag row', async () => {
    renderPage(pageHandlers('admin', { [`GET /v1/environments/${ENV_ID}/flags`]: [] }));
    await loaded();
    expect(screen.getByText('Loading flag state…')).toBeTruthy();
  });
});

describe('config panel', () => {
  it('shows the current version and pre-fills the draft', async () => {
    renderPage();
    await flagReady();
    expect(screen.getByText('(version 3)')).toBeTruthy();
    expect(screen.getByLabelText('Config value')).toHaveProperty(
      'value',
      JSON.stringify({ limit: 5, mode: 'fast' }, null, 2),
    );
  });

  it('offers a fallback skeleton when no config exists yet', async () => {
    renderPage(
      pageHandlers('admin', {
        [`GET ${CONFIG_BASE()}`]: config({ value: null, version: 0 }),
        [`GET ${CONFIG_BASE()}/versions`]: [],
      }),
    );
    await flagReady();
    expect(screen.getByLabelText('Config value')).toHaveProperty(
      'value',
      JSON.stringify({ fallback: { mode: 'message', message: '' } }, null, 2),
    );
    // No history table when there are no versions.
    expect(screen.queryByText('History')).toBeNull();
  });

  it('saves the draft as the next version', async () => {
    const { stub } = renderPage(
      pageHandlers('admin', { [`PUT ${CONFIG_BASE()}`]: { version: 4 } }),
    );
    await flagReady();

    expect(screen.getByText('Save as version 4')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Config value'), {
      target: { value: '{"limit":9}' },
    });
    fireEvent.click(screen.getByText('Save as version 4'));

    await waitFor(() =>
      expect(stub.calls.find((c) => c.key === `PUT ${CONFIG_BASE()}`)?.body).toEqual({
        value: { limit: 9 },
      }),
    );
  });

  it('rejects invalid JSON in the config draft', async () => {
    const { stub } = renderPage();
    await flagReady();

    fireEvent.change(screen.getByLabelText('Config value'), { target: { value: '{' } });
    fireEvent.click(screen.getByText('Save as version 4'));
    expect(screen.getByText('Not valid JSON.')).toBeTruthy();
    expect(stub.calls.some((c) => c.key.startsWith('PUT'))).toBe(false);
  });

  it('rejects a non-object config', async () => {
    const { stub } = renderPage();
    await flagReady();

    fireEvent.change(screen.getByLabelText('Config value'), { target: { value: '[1,2,3]' } });
    fireEvent.click(screen.getByText('Save as version 4'));
    expect(screen.getByText('Config must be a JSON object.')).toBeTruthy();
    expect(stub.calls.some((c) => c.key.startsWith('PUT'))).toBe(false);
  });

  it('surfaces a rejected save', async () => {
    renderPage(
      pageHandlers('admin', {
        [`PUT ${CONFIG_BASE()}`]: { status: 403, body: { error: 'forbidden', message: 'nope' } },
      }),
    );
    await flagReady();

    fireEvent.click(screen.getByText('Save as version 4'));
    await waitFor(() => expect(screen.getByText('nope')).toBeTruthy());
  });

  it('hides the save button from a viewer', async () => {
    renderPage(pageHandlers('viewer'));
    await flagReady();
    expect(screen.queryByText(/Save as version/)).toBeNull();
  });
});

describe('config history', () => {
  it('lists versions and notes a restore', async () => {
    renderPage(
      pageHandlers('admin', {
        [`GET ${CONFIG_BASE()}/versions`]: [version(3, { restoredFromVersion: 1 }), version(2)],
      }),
    );
    await flagReady();

    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.getByText('v3')).toBeTruthy();
    expect(screen.getByText('restored from v1')).toBeTruthy();
  });

  it('toggles a diff open and closed', async () => {
    renderPage();
    await flagReady();

    const [diffButton] = screen.getAllByText('diff');
    fireEvent.click(diffButton!);
    expect(screen.getByText(/removed lines are v3/)).toBeTruthy();
    // The added/removed lines come from the LCS diff of the two payloads.
    expect(document.querySelector('.diff .removed')).toBeTruthy();

    fireEvent.click(screen.getByText('hide diff'));
    expect(screen.queryByText(/removed lines are v/)).toBeNull();
  });

  it('offers restore only for versions that are not current', async () => {
    renderPage();
    await flagReady();
    // v3 is current, v2 is not — so exactly one restore button.
    expect(screen.getAllByText('restore')).toHaveLength(1);
  });

  it('rolls back to a chosen version after confirming', async () => {
    const { stub } = renderPage(
      pageHandlers('admin', { [`POST ${CONFIG_BASE()}/rollback`]: { version: 4 } }),
    );
    await flagReady();

    fireEvent.click(screen.getByText('restore'));
    fireEvent.click(screen.getByText('Restore this version?'));

    await waitFor(() =>
      expect(stub.calls.find((c) => c.key === `POST ${CONFIG_BASE()}/rollback`)?.body).toEqual({
        toVersion: 2,
      }),
    );
  });

  it('surfaces a failed rollback', async () => {
    renderPage(
      pageHandlers('admin', {
        [`POST ${CONFIG_BASE()}/rollback`]: {
          status: 409,
          body: { error: 'conflict', message: 'version moved on' },
        },
      }),
    );
    await flagReady();

    fireEvent.click(screen.getByText('restore'));
    fireEvent.click(screen.getByText('Restore this version?'));
    await waitFor(() => expect(screen.getByText('version moved on')).toBeTruthy());
  });

  it('hides restore from a viewer but keeps the diff', async () => {
    renderPage(pageHandlers('viewer'));
    await flagReady();
    expect(screen.queryByText('restore')).toBeNull();
    expect(screen.getAllByText('diff').length).toBeGreaterThan(0);
  });
});
