// @vitest-environment happy-dom
/**
 * Workspace selection: which org/project/environment is active, how a stored
 * override interacts with what the API actually returns, and the localStorage
 * cascade when a higher-level selection changes.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useWorkspace } from '../src/state/WorkspaceContext';
import {
  ENV_ID,
  ORG_ID,
  PROJECT_ID,
  environments,
  me,
  project,
  renderWithProviders,
  stubAuth,
  stubFetch,
  workspaceHandlers,
  type Handlers,
} from './harness';

const SECOND_ORG = '99999999-9999-4999-8999-999999999999';
const SECOND_PROJECT = '88888888-8888-4888-8888-888888888888';
const PROD_ENV = '44444444-4444-4444-8444-444444444444';

beforeEach(() => {
  localStorage.clear();
  stubAuth();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Probe() {
  const ws = useWorkspace();
  return (
    <>
      <span data-testid="org">{ws.orgId ?? '-'}</span>
      <span data-testid="role">{ws.role ?? '-'}</span>
      <span data-testid="project">{ws.projectId ?? '-'}</span>
      <span data-testid="env">{ws.environmentId ?? '-'}</span>
      <span data-testid="env-name">{ws.environment?.name ?? '-'}</span>
      <span data-testid="loading">{ws.loading ? 'yes' : 'no'}</span>
      <button type="button" onClick={() => ws.selectOrg(SECOND_ORG)}>
        pick org
      </button>
      <button type="button" onClick={() => ws.selectProject(SECOND_PROJECT)}>
        pick project
      </button>
      <button type="button" onClick={() => ws.selectEnvironment(PROD_ENV)}>
        pick env
      </button>
      <button type="button" onClick={() => void ws.createProject('Fresh')}>
        create
      </button>
    </>
  );
}

const renderProbe = (handlers: Handlers = workspaceHandlers()) => {
  const stub = stubFetch(handlers);
  const view = renderWithProviders(<Probe />);
  return { stub, view };
};

const settled = () => waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('no'));

describe('default selection', () => {
  it('picks the first org, project, and environment', async () => {
    renderProbe();
    await settled();
    expect(screen.getByTestId('org').textContent).toBe(ORG_ID);
    expect(screen.getByTestId('project').textContent).toBe(PROJECT_ID);
    expect(screen.getByTestId('env').textContent).toBe(ENV_ID);
    expect(screen.getByTestId('env-name').textContent).toBe('Development');
  });

  it('exposes the caller role for the active org', async () => {
    renderProbe(workspaceHandlers('viewer'));
    await settled();
    expect(screen.getByTestId('role').textContent).toBe('viewer');
  });

  it('reports nothing selected when the user has no orgs', async () => {
    renderProbe({ 'GET /v1/me': { user: me().user, orgs: [] } });
    await settled();
    expect(screen.getByTestId('org').textContent).toBe('-');
    expect(screen.getByTestId('role').textContent).toBe('-');
  });

  it('handles an org with no projects', async () => {
    renderProbe({
      ...workspaceHandlers(),
      [`GET /v1/orgs/${ORG_ID}/projects`]: [],
    });
    await settled();
    expect(screen.getByTestId('project').textContent).toBe('-');
    expect(screen.getByTestId('env').textContent).toBe('-');
  });
});

describe('stored overrides', () => {
  it('restores a remembered environment', async () => {
    localStorage.setItem('tf.environment', PROD_ENV);
    renderProbe();
    await settled();
    expect(screen.getByTestId('env').textContent).toBe(PROD_ENV);
    expect(screen.getByTestId('env-name').textContent).toBe('Production');
  });

  it('ignores a remembered org the user no longer belongs to', async () => {
    localStorage.setItem('tf.org', SECOND_ORG);
    renderProbe();
    await settled();
    expect(screen.getByTestId('org').textContent).toBe(ORG_ID);
  });

  it('ignores a remembered project that is not in the active org', async () => {
    localStorage.setItem('tf.project', SECOND_PROJECT);
    renderProbe();
    await settled();
    expect(screen.getByTestId('project').textContent).toBe(PROJECT_ID);
  });
});

describe('selection cascade', () => {
  it('clears the project and environment when the org changes', async () => {
    localStorage.setItem('tf.project', PROJECT_ID);
    localStorage.setItem('tf.environment', PROD_ENV);
    renderProbe();
    await settled();

    fireEvent.click(screen.getByText('pick org'));

    // A project from the previous org must not survive the switch.
    expect(localStorage.getItem('tf.org')).toBe(SECOND_ORG);
    expect(localStorage.getItem('tf.project')).toBeNull();
    expect(localStorage.getItem('tf.environment')).toBeNull();
  });

  it('clears only the environment when the project changes', async () => {
    localStorage.setItem('tf.environment', PROD_ENV);
    renderProbe();
    await settled();

    fireEvent.click(screen.getByText('pick project'));
    expect(localStorage.getItem('tf.project')).toBe(SECOND_PROJECT);
    expect(localStorage.getItem('tf.environment')).toBeNull();
  });

  it('persists an environment choice on its own', async () => {
    renderProbe();
    await settled();
    fireEvent.click(screen.getByText('pick env'));
    expect(localStorage.getItem('tf.environment')).toBe(PROD_ENV);
    await waitFor(() => expect(screen.getByTestId('env').textContent).toBe(PROD_ENV));
  });
});

describe('createProject', () => {
  it('creates, refetches, and selects the new project', async () => {
    const created = { id: SECOND_PROJECT, name: 'Fresh' };
    const stub = stubFetch({
      ...workspaceHandlers(),
      [`POST /v1/orgs/${ORG_ID}/projects`]: created,
      [`GET /v1/projects/${SECOND_PROJECT}/environments`]: environments(),
    });
    renderWithProviders(<Probe />);
    await settled();

    // The list must include the new project once refetched, or selection would
    // fall back to the first entry.
    stub.set({ [`GET /v1/orgs/${ORG_ID}/projects`]: [project(), created] });
    fireEvent.click(screen.getByText('create'));

    await waitFor(() => expect(screen.getByTestId('project').textContent).toBe(SECOND_PROJECT));
    expect(localStorage.getItem('tf.project')).toBe(SECOND_PROJECT);
    expect(stub.calls.some((c) => c.key === `POST /v1/orgs/${ORG_ID}/projects`)).toBe(true);
  });
});

describe('useWorkspace guard', () => {
  it('throws outside a provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('useWorkspace outside WorkspaceProvider');
  });
});
