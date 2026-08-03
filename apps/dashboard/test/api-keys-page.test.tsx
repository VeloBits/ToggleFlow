// @vitest-environment happy-dom
/**
 * API keys: admin-only gate, issue-and-reveal-once flow, revocation, and the
 * fact that a revoked key stays listed but loses its Revoke control.
 */
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiKey } from '../src/api/client';
import { ApiKeysPage } from '../src/pages/ApiKeysPage';
import {
  ENV_ID,
  renderWithProviders,
  stubAuth,
  stubFetch,
  workspaceHandlers,
  type FetchStub,
  type Handlers,
} from './harness';

const KEYS_URL = `/v1/environments/${ENV_ID}/keys`;

const key = (over: Partial<ApiKey> = {}): ApiKey => ({
  id: 'k1',
  environmentId: ENV_ID,
  kind: 'server',
  name: 'production backend',
  prefix: 'tf_srv_abc',
  createdAt: '2026-07-20T10:00:00.000Z',
  revokedAt: null,
  ...over,
});

const pageHandlers = (
  role: 'admin' | 'developer' | 'viewer' = 'admin',
  over: Handlers = {},
): Handlers => ({
  ...workspaceHandlers(role),
  [`GET ${KEYS_URL}`]: [key()],
  ...over,
});

function renderPage(handlers: Handlers = pageHandlers()): { stub: FetchStub } {
  stubAuth();
  const stub = stubFetch(handlers);
  renderWithProviders(<ApiKeysPage />);
  return { stub };
}

const loaded = () => waitFor(() => expect(screen.getByText('production backend')).toBeTruthy());

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('access', () => {
  it.each(['developer', 'viewer'] as const)('refuses the page to a %s', async (role) => {
    const { stub } = renderPage(pageHandlers(role));
    await waitFor(() =>
      expect(screen.getByText('API keys are managed by org admins.')).toBeTruthy(),
    );
    // The query is disabled for non-admins, so no key ever reaches the browser.
    expect(stub.calls.some((c) => c.key.includes('/keys'))).toBe(false);
  });

  it('shows the environment scope to an admin', async () => {
    renderPage();
    await loaded();
    expect(screen.getByText('scoped to Production')).toBeTruthy();
  });
});

describe('listing', () => {
  it('renders kind, truncated prefix, and active status', async () => {
    renderPage();
    await loaded();
    expect(screen.getByText('server')).toBeTruthy();
    expect(screen.getByText('tf_srv_abc…')).toBeTruthy();
    expect(screen.getByText('active')).toBeTruthy();
  });

  it('marks a revoked key and drops its Revoke button', async () => {
    renderPage(
      pageHandlers('admin', {
        [`GET ${KEYS_URL}`]: [key({ revokedAt: '2026-07-21T10:00:00.000Z' })],
      }),
    );
    await loaded();
    expect(screen.getByText('revoked')).toBeTruthy();
    expect(screen.queryByText('Revoke')).toBeNull();
  });

  it('shows an empty state', async () => {
    renderPage(pageHandlers('admin', { [`GET ${KEYS_URL}`]: [] }));
    await waitFor(() => expect(screen.getByText('No keys for this environment yet.')).toBeTruthy());
  });

  it('surfaces a load failure', async () => {
    renderPage(
      pageHandlers('admin', {
        [`GET ${KEYS_URL}`]: { status: 500, body: { error: 'server_error', message: 'kaput' } },
      }),
    );
    await waitFor(() => expect(screen.getByText('kaput')).toBeTruthy());
  });
});

describe('creation', () => {
  it('issues a key and reveals the token exactly once', async () => {
    const { stub } = renderPage(
      pageHandlers('admin', {
        [`POST ${KEYS_URL}`]: key({ id: 'k2', token: 'tf_srv_full-secret-value' }),
      }),
    );
    await loaded();

    fireEvent.click(screen.getByText('＋ Create key'));
    const submit = screen.getByText('Create');
    expect(submit).toHaveProperty('disabled', true);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'ci runner' } });
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'client' } });
    expect(submit).toHaveProperty('disabled', false);
    fireEvent.click(submit);

    await waitFor(() => expect(screen.getByText('Copy your key now')).toBeTruthy());
    expect(screen.getByText('tf_srv_full-secret-value')).toBeTruthy();
    expect(stub.calls.find((c) => c.key === `POST ${KEYS_URL}`)?.body).toEqual({
      name: 'ci runner',
      kind: 'client',
    });
    // The creation modal gives way to the reveal modal.
    expect(screen.queryByText('Create API key')).toBeNull();
  });

  it('copies the revealed token to the clipboard', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    renderPage(
      pageHandlers('admin', { [`POST ${KEYS_URL}`]: key({ id: 'k2', token: 'tf_cli_secret' }) }),
    );
    await loaded();

    fireEvent.click(screen.getByText('＋ Create key'));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'browser' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => expect(screen.getByText('Copy your key now')).toBeTruthy());
    fireEvent.click(screen.getByText('Copy'));
    expect(writeText).toHaveBeenCalledWith('tf_cli_secret');
  });

  it('dismisses the reveal modal for good', async () => {
    renderPage(
      pageHandlers('admin', { [`POST ${KEYS_URL}`]: key({ id: 'k2', token: 'tf_srv_x' }) }),
    );
    await loaded();

    fireEvent.click(screen.getByText('＋ Create key'));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'temp' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => expect(screen.getByText('Copy your key now')).toBeTruthy());
    fireEvent.click(screen.getByText('Done'));
    expect(screen.queryByText('Copy your key now')).toBeNull();
    expect(screen.queryByText('tf_srv_x')).toBeNull();
  });

  it('surfaces a rejected creation and keeps the form open', async () => {
    renderPage(
      pageHandlers('admin', {
        [`POST ${KEYS_URL}`]: {
          status: 402,
          body: { error: 'quota', message: 'key limit reached' },
        },
      }),
    );
    await loaded();

    fireEvent.click(screen.getByText('＋ Create key'));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'one too many' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => expect(screen.getByText('key limit reached')).toBeTruthy());
    expect(screen.getByText('Create API key')).toBeTruthy();
  });

  it('closes on cancel without issuing anything', async () => {
    const { stub } = renderPage();
    await loaded();

    fireEvent.click(screen.getByText('＋ Create key'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Create API key')).toBeNull();
    expect(stub.calls.some((c) => c.key.startsWith('POST'))).toBe(false);
  });
});

describe('revocation', () => {
  it('revokes after a confirm', async () => {
    const { stub } = renderPage(
      pageHandlers('admin', { 'DELETE /v1/api-keys/k1': { ...key(), revokedAt: 'now' } }),
    );
    await loaded();

    fireEvent.click(screen.getByText('Revoke'));
    expect(stub.calls.some((c) => c.key.startsWith('DELETE'))).toBe(false);

    fireEvent.click(screen.getByText('Revoke permanently?'));
    await waitFor(() =>
      expect(stub.calls.some((c) => c.key === 'DELETE /v1/api-keys/k1')).toBe(true),
    );
  });

  it('surfaces a failed revocation', async () => {
    renderPage(
      pageHandlers('admin', {
        'DELETE /v1/api-keys/k1': {
          status: 500,
          body: { error: 'server_error', message: 'could not revoke' },
        },
      }),
    );
    await loaded();

    fireEvent.click(screen.getByText('Revoke'));
    fireEvent.click(screen.getByText('Revoke permanently?'));
    await waitFor(() => expect(screen.getByText('could not revoke')).toBeTruthy());
  });
});
