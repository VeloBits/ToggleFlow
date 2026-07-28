// @vitest-environment happy-dom
/**
 * The app shell: org/project/environment switchers, the admin-only project
 * creation path, identity display, theme toggle, and nav.
 */
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '../src/auth/AuthContext';
import { Layout } from '../src/components/Layout';
import {
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
  type FetchStub,
} from './harness';

const SECOND_PROJECT = '88888888-8888-4888-8888-888888888888';
const PROD_ENV = '44444444-4444-4444-8444-444444444444';

beforeEach(() => {
  localStorage.clear();
  document.body.className = '';
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderLayout(handlers: Handlers = workspaceHandlers()): { stub: FetchStub } {
  stubAuth();
  const stub = stubFetch(handlers);
  renderWithProviders(
    <AuthProvider>
      <Layout>
        <p>page body</p>
      </Layout>
    </AuthProvider>,
  );
  return { stub };
}

/**
 * Waits for all three switchers to be populated. Gating on the Project select
 * alone is not enough — the environments query resolves one tick later, and
 * asserting before that reads an empty select.
 */
const ready = () =>
  waitFor(() => {
    expect(screen.getByLabelText('Project')).toBeTruthy();
    expect((screen.getByLabelText('Environment') as HTMLSelectElement).value).not.toBe('');
  });

describe('shell', () => {
  it('renders the brand, nav, and page children', async () => {
    renderLayout();
    await ready();

    expect(screen.getByText('ToggleFlow')).toBeTruthy();
    expect(screen.getByText('page body')).toBeTruthy();
    for (const label of ['Tools', 'Segments', 'API keys', 'Audit log', 'Members']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('shows the display name and role', async () => {
    renderLayout();
    await ready();
    expect(screen.getByText(/Dev User · admin/)).toBeTruthy();
  });

  it('falls back to the email when there is no display name', async () => {
    renderLayout({
      ...workspaceHandlers(),
      'GET /v1/me': { user: { ...me().user, displayName: null }, orgs: me().orgs },
    });
    await ready();
    expect(screen.getByText(/dev@velobits\.test · admin/)).toBeTruthy();
  });

  it('signs out through the UserManager', async () => {
    stubAuth();
    const auth = stubAuth();
    stubFetch(workspaceHandlers());
    renderWithProviders(
      <AuthProvider>
        <Layout>
          <p>body</p>
        </Layout>
      </AuthProvider>,
    );
    await ready();

    fireEvent.click(screen.getByText('Sign out'));
    expect(auth.signoutRedirect).toHaveBeenCalled();
  });
});

describe('switchers', () => {
  it('lists orgs, projects, and environments', async () => {
    renderLayout();
    await ready();

    expect(screen.getByLabelText('Organization')).toHaveProperty('value', ORG_ID);
    expect(screen.getByLabelText('Project')).toHaveProperty('value', PROJECT_ID);
    // Environments render as "Name (key)".
    expect(screen.getByText('Production (prod)')).toBeTruthy();
  });

  it('switching environment persists the choice', async () => {
    renderLayout();
    await ready();

    fireEvent.change(screen.getByLabelText('Environment'), { target: { value: PROD_ENV } });
    expect(localStorage.getItem('tf.environment')).toBe(PROD_ENV);
  });

  it('switching project persists it and resets the environment', async () => {
    localStorage.setItem('tf.environment', PROD_ENV);
    renderLayout({
      ...workspaceHandlers(),
      [`GET /v1/orgs/${ORG_ID}/projects`]: [project(), { id: SECOND_PROJECT, name: 'Second' }],
      [`GET /v1/projects/${SECOND_PROJECT}/environments`]: environments(),
    });
    await ready();

    fireEvent.change(screen.getByLabelText('Project'), { target: { value: SECOND_PROJECT } });
    expect(localStorage.getItem('tf.project')).toBe(SECOND_PROJECT);
    expect(localStorage.getItem('tf.environment')).toBeNull();
  });
});

describe('project creation', () => {
  it('offers a create option to admins and creates from the modal', async () => {
    const created = { id: SECOND_PROJECT, name: 'Fresh' };
    const { stub } = renderLayout({
      ...workspaceHandlers(),
      [`POST /v1/orgs/${ORG_ID}/projects`]: created,
      [`GET /v1/projects/${SECOND_PROJECT}/environments`]: environments(),
    });
    await ready();

    fireEvent.change(screen.getByLabelText('Project'), { target: { value: '__new__' } });
    expect(screen.getByText('New project')).toBeTruthy();

    const submit = screen.getByText('Create (with dev/staging/prod)');
    // Guarded until a name is typed.
    expect(submit).toHaveProperty('disabled', true);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Fresh  ' } });
    expect(submit).toHaveProperty('disabled', false);

    stub.set({ [`GET /v1/orgs/${ORG_ID}/projects`]: [project(), created] });
    fireEvent.click(submit);

    await waitFor(() => expect(screen.getByText(/Project created/)).toBeTruthy());
    // Name is trimmed before it reaches the API.
    const call = stub.calls.find((c) => c.key === `POST /v1/orgs/${ORG_ID}/projects`);
    expect(call?.body).toEqual({ name: 'Fresh' });
  });

  it('surfaces a creation failure in the modal and keeps it open', async () => {
    renderLayout({
      ...workspaceHandlers(),
      [`POST /v1/orgs/${ORG_ID}/projects`]: {
        status: 403,
        body: { error: 'forbidden', message: 'role too low' },
      },
    });
    await ready();

    fireEvent.change(screen.getByLabelText('Project'), { target: { value: '__new__' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Nope' } });
    fireEvent.click(screen.getByText('Create (with dev/staging/prod)'));

    await waitFor(() => expect(screen.getByText('role too low')).toBeTruthy());
    expect(screen.getByText('New project')).toBeTruthy();
  });

  it('closes the modal on cancel', async () => {
    renderLayout();
    await ready();

    fireEvent.change(screen.getByLabelText('Project'), { target: { value: '__new__' } });
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('New project')).toBeNull();
  });

  it('offers a bare create button when the org has no projects', async () => {
    renderLayout({ ...workspaceHandlers(), [`GET /v1/orgs/${ORG_ID}/projects`]: [] });
    await waitFor(() => expect(screen.getByText('＋ New project')).toBeTruthy());
    // No project select exists to hang the "__new__" option off.
    expect(screen.queryByLabelText('Project')).toBeNull();
  });

  it('hides project creation from non-admins', async () => {
    renderLayout({ ...workspaceHandlers('developer'), [`GET /v1/orgs/${ORG_ID}/projects`]: [] });
    await waitFor(() => expect(screen.getByText(/developer/)).toBeTruthy());
    expect(screen.queryByText('＋ New project')).toBeNull();
  });

  it('offers no __new__ option to a viewer who does have projects', async () => {
    renderLayout(workspaceHandlers('viewer'));
    await ready();
    expect(screen.queryByText('＋ New project…')).toBeNull();
  });
});

describe('theme toggle', () => {
  it('flips the theme and relabels itself', async () => {
    renderLayout();
    await ready();

    const toggle = screen.getByLabelText('Switch to dark theme');
    fireEvent.click(toggle);
    expect(document.body.classList.contains('dark')).toBe(true);

    // The control now offers the inverse action.
    fireEvent.click(screen.getByLabelText('Switch to light theme'));
    expect(document.body.classList.contains('dark')).toBe(false);
  });
});
