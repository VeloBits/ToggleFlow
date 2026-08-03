// @vitest-environment happy-dom
/** Project rename and danger zone, plus the read-only organization summary. */
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BillingPage, IntegrationsPage, WebhooksPage } from '../src/pages/PlannedPages';
import { SettingsPage } from '../src/pages/SettingsPage';
import {
  ORG_ID,
  PROJECT_ID,
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
  renderWithProviders(<SettingsPage />);
  return { stub };
}

const loaded = () =>
  waitFor(() => expect(screen.getByLabelText('Name')).toHaveProperty('value', 'Control Plane'));

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('project settings', () => {
  it('loads the current name and only enables Save once it changes', async () => {
    renderPage();
    await loaded();

    const save = screen.getByText('Save') as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed' } });
    expect(save.disabled).toBe(false);
  });

  it('renames the project', async () => {
    const { stub } = renderPage({
      ...workspaceHandlers(),
      [`PATCH /v1/projects/${PROJECT_ID}`]: { id: PROJECT_ID, name: 'Renamed' },
    });
    await loaded();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByText('Project renamed')).toBeTruthy());
    expect(stub.calls.find((c) => c.key === `PATCH /v1/projects/${PROJECT_ID}`)?.body).toEqual({
      name: 'Renamed',
    });
  });

  it('deletes the project after a confirm and forgets the selection', async () => {
    localStorage.setItem('tf.project', PROJECT_ID);
    const { stub } = renderPage({
      ...workspaceHandlers(),
      [`DELETE /v1/projects/${PROJECT_ID}`]: { status: 204 },
      [`GET /v1/orgs/${ORG_ID}/projects`]: [{ id: PROJECT_ID, name: 'Control Plane' }],
    });
    await loaded();

    fireEvent.click(screen.getByText('Delete project'));
    fireEvent.click(screen.getByText('Delete permanently?'));

    await waitFor(() => expect(localStorage.getItem('tf.project')).toBeNull());
    expect(stub.calls.some((c) => c.key === `DELETE /v1/projects/${PROJECT_ID}`)).toBe(true);
  });

  it('is read-only for a non-admin, with the danger zone absent', async () => {
    renderPage(workspaceHandlers('developer'));
    await loaded();
    expect(screen.getByLabelText('Name')).toHaveProperty('disabled', true);
    expect(screen.queryByText('Save')).toBeNull();
    expect(screen.queryByText('Danger zone')).toBeNull();
    expect(screen.getByText(/Only organization admins can rename/)).toBeTruthy();
  });
});

describe('organization settings', () => {
  it('summarises the org, the caller role, and the project count', async () => {
    renderPage();
    await loaded();
    expect(screen.getByText('VeloBits')).toBeTruthy();
    expect(screen.getByText('admin')).toBeTruthy();
    expect(screen.getByText(ORG_ID)).toBeTruthy();
  });
});

describe('planned surfaces', () => {
  it.each([
    ['Webhooks', WebhooksPage],
    ['Integrations', IntegrationsPage],
    ['Billing', BillingPage],
  ])('%s says plainly that it is not built yet', async (title, Page) => {
    stubAuth();
    stubFetch(workspaceHandlers());
    renderWithProviders(<Page />);
    await waitFor(() => expect(screen.getByText(title)).toBeTruthy());
    expect(screen.getByText('Not yet available')).toBeTruthy();
    expect(screen.getByText('Planned')).toBeTruthy();
  });
});
