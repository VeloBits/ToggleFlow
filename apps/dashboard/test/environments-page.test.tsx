// @vitest-environment happy-dom
/**
 * Environments CRUD, plus the two guards that keep a project usable: you
 * cannot delete the environment you are standing in, and you cannot delete
 * the last one.
 */
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EnvironmentsPage } from '../src/pages/EnvironmentsPage';
import {
  DEV_ENV_ID,
  ENV_ID,
  ORG_ID,
  PROJECT_ID,
  environments,
  renderWithProviders,
  stubAuth,
  stubFetch,
  workspaceHandlers,
  type FetchStub,
  type Handlers,
} from './harness';

function renderPage(handlers: Handlers = workspaceHandlers()): { stub: FetchStub } {
  stubAuth();
  const stub = stubFetch(handlers);
  renderWithProviders(<EnvironmentsPage />);
  return { stub };
}

const loaded = () => waitFor(() => expect(screen.getByText('Production')).toBeTruthy());
const deleteButtons = () => screen.getAllByText('Delete') as HTMLButtonElement[];

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('listing', () => {
  it('shows every environment with its key and marks the current one', async () => {
    renderPage();
    await loaded();
    expect(screen.getByText('prod')).toBeTruthy();
    expect(screen.getByText('dev')).toBeTruthy();
    expect(screen.getByText('current')).toBeTruthy();
  });

  it('switches environment from the row', async () => {
    renderPage();
    await loaded();
    fireEvent.click(screen.getByText('Switch to'));
    expect(localStorage.getItem('tf.environment')).toBe(DEV_ENV_ID);
  });

  it('explains itself when no project is selected', async () => {
    renderPage({ ...workspaceHandlers(), [`GET /v1/orgs/${ORG_ID}/projects`]: [] });
    await waitFor(() => expect(screen.getByText('No project selected')).toBeTruthy());
  });
});

describe('guards', () => {
  it('refuses to delete the environment currently in use', async () => {
    renderPage();
    await loaded();
    // Production is current, Development is not.
    const [prodDelete, devDelete] = deleteButtons();
    expect(prodDelete?.disabled).toBe(true);
    expect(devDelete?.disabled).toBe(false);
  });

  it('refuses to delete the last remaining environment', async () => {
    renderPage({
      ...workspaceHandlers(),
      [`GET /v1/projects/${PROJECT_ID}/environments`]: [environments()[0]!],
    });
    await loaded();
    expect(deleteButtons()[0]?.disabled).toBe(true);
  });

  it('hides every mutation from a non-admin', async () => {
    renderPage(workspaceHandlers('developer'));
    await loaded();
    expect(screen.queryByText('Delete')).toBeNull();
    expect(screen.queryByText('Rename')).toBeNull();
    expect(screen.queryByText('New environment')).toBeNull();
  });
});

describe('mutations', () => {
  it('renames an environment', async () => {
    const { stub } = renderPage({
      ...workspaceHandlers(),
      [`PATCH /v1/environments/${DEV_ENV_ID}`]: { id: DEV_ENV_ID, key: 'dev', name: 'Sandbox' },
    });
    await loaded();

    fireEvent.click(screen.getAllByText('Rename')[1]!);
    fireEvent.change(screen.getByLabelText(/New name for Development/), {
      target: { value: 'Sandbox' },
    });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByText('Environment renamed')).toBeTruthy());
    expect(stub.calls.find((c) => c.key === `PATCH /v1/environments/${DEV_ENV_ID}`)?.body).toEqual({
      name: 'Sandbox',
    });
  });

  it('deletes after a second click', async () => {
    const { stub } = renderPage({
      ...workspaceHandlers(),
      [`DELETE /v1/environments/${DEV_ENV_ID}`]: { status: 204 },
    });
    await loaded();

    const devDelete = deleteButtons()[1]!;
    fireEvent.click(devDelete);
    expect(stub.calls.some((c) => c.key.startsWith('DELETE'))).toBe(false);

    fireEvent.click(screen.getByText('Delete for good?'));
    await waitFor(() =>
      expect(stub.calls.some((c) => c.key === `DELETE /v1/environments/${DEV_ENV_ID}`)).toBe(true),
    );
  });

  it('creates one and selects it, inheriting the current environment', async () => {
    const created = { id: 'env-qa', key: 'qa', name: 'QA' };
    const { stub } = renderPage({
      ...workspaceHandlers(),
      [`POST /v1/projects/${PROJECT_ID}/environments`]: {
        ...created,
        inheritedFrom: { id: ENV_ID, key: 'prod', name: 'Production' },
        copied: [{ key: 'flagStates', label: 'flag states', count: 3 }],
      },
    });
    await loaded();

    fireEvent.click(screen.getByText('New environment'));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'QA' } });
    stub.set({
      [`GET /v1/projects/${PROJECT_ID}/environments`]: [...environments(), created],
    });
    fireEvent.click(screen.getByText('Create environment', { selector: 'button' }));

    await waitFor(() => expect(localStorage.getItem('tf.environment')).toBe('env-qa'));
    expect(
      stub.calls.find((c) => c.key === `POST /v1/projects/${PROJECT_ID}/environments`)?.body,
    ).toEqual({ key: 'qa', name: 'QA', inheritFromEnvironmentId: ENV_ID });
    expect(screen.getAllByText(/3 flag states from Production/).length).toBeGreaterThan(0);
  });

  it('duplicates a row by pre-selecting it as the inheritance source', async () => {
    renderPage();
    await loaded();

    // Development is the second row, and is not the current environment - so
    // this proves the row identity is what seeds the dialog, not the selection.
    fireEvent.click(screen.getAllByText('Duplicate')[1]!);
    expect(await screen.findByLabelText('Inherit from')).toHaveProperty('value', DEV_ENV_ID);
  });

  it('surfaces a failed rename', async () => {
    renderPage({
      ...workspaceHandlers(),
      [`PATCH /v1/environments/${ENV_ID}`]: {
        status: 403,
        body: { error: 'forbidden', message: 'role too low' },
      },
    });
    await loaded();

    fireEvent.click(screen.getAllByText('Rename')[0]!);
    fireEvent.change(screen.getByLabelText(/New name for Production/), {
      target: { value: 'Live' },
    });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(screen.getByText('role too low')).toBeTruthy());
  });
});
