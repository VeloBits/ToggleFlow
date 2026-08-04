// @vitest-environment happy-dom
/**
 * The app shell: the top bar's org/project/environment pickers and their
 * create flows, the sidebar's navigation, and the account footer that now
 * owns identity, theme and sign-out.
 *
 * The pickers are Radix menus, so the rows only exist once the trigger is
 * opened - `openPicker` is the entry point for anything that asserts on them.
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '../src/auth/AuthContext';
import { Layout } from '../src/components/Layout';
import { NAV_ITEMS } from '../src/components/nav/nav-items';
import {
  DEV_ENV_ID,
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
  type FetchStub,
  type Handlers,
} from './harness';

const SECOND_PROJECT = '88888888-8888-4888-8888-888888888888';
const SECOND_ORG = '99999999-9999-4999-8999-999999999999';

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

/** All three pickers are populated - the environments query resolves last. */
const ready = () =>
  waitFor(() => expect(screen.getByLabelText('Environment: Production')).toBeTruthy());

/**
 * Opens a scope menu by its trigger's accessible name and returns the menu.
 *
 * Enter rather than a click: Radix opens a DropdownMenu on `pointerdown`,
 * which fireEvent.click does not produce, and the keyboard path is one the
 * shell has to support anyway.
 */
async function openPicker(name: RegExp): Promise<HTMLElement> {
  fireEvent.keyDown(screen.getByLabelText(name), { key: 'Enter' });
  return await screen.findByRole('menu');
}

describe('shell', () => {
  it('renders the brand, every nav item, and the page children', async () => {
    renderLayout();
    await ready();

    expect(screen.getByText('ToggleFlow')).toBeTruthy();
    expect(screen.getByText('page body')).toBeTruthy();

    const nav = screen.getByRole('navigation', { name: 'Main' });
    for (const item of NAV_ITEMS) {
      expect(within(nav).getByText(item.label)).toBeTruthy();
    }
  });

  it('marks unbuilt surfaces rather than hiding them', async () => {
    renderLayout();
    await ready();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    // Webhooks, Integrations and Billing are routed but not implemented.
    expect(within(nav).getAllByText('Soon')).toHaveLength(3);
  });

  it('keeps identity, theme and sign-out out of the top bar', async () => {
    renderLayout();
    await ready();
    const topbar = screen.getByRole('navigation', { name: 'Scope' });
    expect(within(topbar).queryByText(/Dev User/)).toBeNull();
    expect(within(topbar).queryByText('Sign out')).toBeNull();
    expect(within(topbar).queryByLabelText(/theme/i)).toBeNull();
  });
});

describe('account footer', () => {
  const openAccount = async () => {
    fireEvent.keyDown(screen.getByLabelText('Account menu'), { key: 'Enter' });
    return await screen.findByRole('menu');
  };

  it('shows the display name with the org and role', async () => {
    renderLayout();
    await ready();
    expect(screen.getByText('Dev User')).toBeTruthy();
    expect(screen.getByText('VeloBits · admin')).toBeTruthy();
  });

  it('falls back to the email when there is no display name', async () => {
    renderLayout({
      ...workspaceHandlers(),
      'GET /v1/me': { user: { ...me().user, displayName: null }, orgs: me().orgs },
    });
    await ready();
    expect(screen.getByText('dev@velobits.test')).toBeTruthy();
  });

  it('signs out through the UserManager', async () => {
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

    const menu = await openAccount();
    fireEvent.click(within(menu).getByText('Sign out'));
    expect(auth.signoutRedirect).toHaveBeenCalled();
  });

  it('flips the theme from the footer and relabels itself without closing', async () => {
    renderLayout();
    await ready();

    const menu = await openAccount();
    fireEvent.click(within(menu).getByText('Switch to dark theme'));
    expect(document.body.classList.contains('dark')).toBe(true);

    // The menu stays open, so the inverse action is available immediately.
    fireEvent.click(within(menu).getByText('Switch to light theme'));
    expect(document.body.classList.contains('dark')).toBe(false);
  });
});

describe('scope pickers', () => {
  it('lists orgs with their role', async () => {
    renderLayout();
    await ready();
    const menu = await openPicker(/^Organization: VeloBits$/);
    expect(
      within(menu)
        .getByRole('menuitemradio', { name: /VeloBits/ })
        .getAttribute('aria-checked'),
    ).toBe('true');
    expect(within(menu).getByText('admin')).toBeTruthy();
  });

  it('switching project persists it and resets the environment', async () => {
    localStorage.setItem('tf.environment', DEV_ENV_ID);
    renderLayout({
      ...workspaceHandlers(),
      [`GET /v1/orgs/${ORG_ID}/projects`]: [project(), { id: SECOND_PROJECT, name: 'Second' }],
      [`GET /v1/projects/${SECOND_PROJECT}/environments`]: environments(),
    });
    await waitFor(() => expect(screen.getByLabelText('Environment: Development')).toBeTruthy());

    const menu = await openPicker(/^Project: Control Plane$/);
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Second' }));

    expect(localStorage.getItem('tf.project')).toBe(SECOND_PROJECT);
    expect(localStorage.getItem('tf.environment')).toBeNull();
  });

  it('switching org clears the project and environment below it', async () => {
    localStorage.setItem('tf.project', PROJECT_ID);
    renderLayout({
      ...workspaceHandlers(),
      'GET /v1/me': {
        user: me().user,
        orgs: [...me().orgs, { id: SECOND_ORG, name: 'Other Co', role: 'viewer' }],
      },
      [`GET /v1/orgs/${SECOND_ORG}/projects`]: [],
    });
    await ready();

    const menu = await openPicker(/^Organization: VeloBits$/);
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: /Other Co/ }));

    expect(localStorage.getItem('tf.org')).toBe(SECOND_ORG);
    expect(localStorage.getItem('tf.project')).toBeNull();
    expect(localStorage.getItem('tf.environment')).toBeNull();
  });

  it('switching environment persists the choice', async () => {
    renderLayout();
    await ready();

    const menu = await openPicker(/^Environment: Production$/);
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: /Development/ }));
    expect(localStorage.getItem('tf.environment')).toBe(DEV_ENV_ID);
  });

  it('offers a filterable switcher once there are more orgs than fit inline', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `org-${i}`,
      name: `Org ${i}`,
      role: 'admin' as const,
    }));
    renderLayout({
      ...workspaceHandlers(),
      'GET /v1/me': { user: me().user, orgs: [...me().orgs, ...many] },
    });
    await ready();

    const menu = await openPicker(/^Organization: VeloBits$/);
    // Only the inline window is listed; the rest are behind the switcher.
    expect(within(menu).getAllByRole('menuitemradio')).toHaveLength(8);
    fireEvent.click(within(menu).getByText('Browse all 13…'));

    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Switch organization'), {
      target: { value: 'org 11' },
    });
    expect(within(dialog).getByText('Org 11')).toBeTruthy();
    expect(within(dialog).queryByText('Org 10')).toBeNull();

    fireEvent.click(within(dialog).getByText('Org 11'));
    expect(localStorage.getItem('tf.org')).toBe('org-11');
  });
});

describe('project creation', () => {
  it('creates from the project picker and switches to the result', async () => {
    const created = { id: SECOND_PROJECT, name: 'Fresh' };
    const { stub } = renderLayout({
      ...workspaceHandlers(),
      [`POST /v1/orgs/${ORG_ID}/projects`]: created,
      [`GET /v1/projects/${SECOND_PROJECT}/environments`]: environments(),
    });
    await ready();

    const menu = await openPicker(/^Project: Control Plane$/);
    fireEvent.click(within(menu).getByText('Create project'));

    const submit = await screen.findByText('Create project', { selector: 'button' });
    expect(submit).toHaveProperty('disabled', true);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Fresh  ' } });
    expect(submit).toHaveProperty('disabled', false);

    stub.set({ [`GET /v1/orgs/${ORG_ID}/projects`]: [project(), created] });
    fireEvent.click(submit);

    await waitFor(() =>
      expect(screen.getAllByText(/Project “Fresh” created/).length).toBeGreaterThan(0),
    );
    // Trimmed before it reaches the API.
    expect(stub.calls.find((c) => c.key === `POST /v1/orgs/${ORG_ID}/projects`)?.body).toEqual({
      name: 'Fresh',
    });
  });

  it('surfaces a creation failure and keeps the dialog open', async () => {
    renderLayout({
      ...workspaceHandlers(),
      [`POST /v1/orgs/${ORG_ID}/projects`]: {
        status: 403,
        body: { error: 'forbidden', message: 'role too low' },
      },
    });
    await ready();

    const menu = await openPicker(/^Project: Control Plane$/);
    fireEvent.click(within(menu).getByText('Create project'));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Nope' } });
    fireEvent.click(screen.getByText('Create project', { selector: 'button' }));

    await waitFor(() => expect(screen.getByText('role too low')).toBeTruthy());
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('promotes creation to a top-bar button when the org has no projects', async () => {
    renderLayout({ ...workspaceHandlers(), [`GET /v1/orgs/${ORG_ID}/projects`]: [] });
    await waitFor(() => expect(screen.getByText('Create project')).toBeTruthy());
    // There is no project to select, so no project picker is rendered.
    expect(screen.queryByLabelText(/^Project:/)).toBeNull();
  });

  it('tells a non-admin with no projects that there are none, without a create action', async () => {
    renderLayout({ ...workspaceHandlers('developer'), [`GET /v1/orgs/${ORG_ID}/projects`]: [] });
    await waitFor(() => expect(screen.getByText('No projects yet')).toBeTruthy());
    expect(screen.queryByText('Create project')).toBeNull();
  });

  it('disables project creation for a viewer who does have projects', async () => {
    renderLayout(workspaceHandlers('viewer'));
    await ready();
    const menu = await openPicker(/^Project: Control Plane$/);
    expect(
      within(menu).getByRole('menuitem', { name: 'Create project' }).getAttribute('data-disabled'),
    ).not.toBeNull();
  });
});

describe('organization creation', () => {
  it('creates an org and switches to it', async () => {
    const { stub } = renderLayout({
      ...workspaceHandlers(),
      'POST /v1/orgs': { id: SECOND_ORG, name: 'Acme', role: 'admin' },
      [`GET /v1/orgs/${SECOND_ORG}/projects`]: [],
    });
    await ready();

    const menu = await openPicker(/^Organization: VeloBits$/);
    fireEvent.click(within(menu).getByText('Create organization'));

    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Acme' } });
    stub.set({
      'GET /v1/me': {
        user: me().user,
        orgs: [...me().orgs, { id: SECOND_ORG, name: 'Acme', role: 'admin' }],
      },
    });
    fireEvent.click(screen.getByText('Create organization', { selector: 'button' }));

    await waitFor(() => expect(localStorage.getItem('tf.org')).toBe(SECOND_ORG));
    expect(stub.calls.find((c) => c.key === 'POST /v1/orgs')?.body).toEqual({ name: 'Acme' });
  });

  it('is offered to every member, not just admins', async () => {
    renderLayout(workspaceHandlers('viewer'));
    await ready();
    const menu = await openPicker(/^Organization: VeloBits$/);
    expect(
      within(menu)
        .getByRole('menuitem', { name: 'Create organization' })
        .getAttribute('data-disabled'),
    ).toBeNull();
  });
});

describe('environment creation', () => {
  const ENV_URL = `POST /v1/projects/${PROJECT_ID}/environments`;
  const newEnv = { id: 'env-new', key: 'load-testing', name: 'Load Testing' };

  /** The shape the API returns: the row, its source, and per-resource counts. */
  const createdWith = (inheritedFrom: object | null, copied: object[] = []) => ({
    ...newEnv,
    inheritedFrom,
    copied,
  });

  const openCreate = async () => {
    const menu = await openPicker(/^Environment: Production$/);
    fireEvent.click(within(menu).getByText('Create environment'));
    return await screen.findByLabelText('Name');
  };

  const postBody = (stub: FetchStub) => stub.calls.find((c) => c.key === ENV_URL)?.body;

  it('derives the key from the name and inherits the current environment by default', async () => {
    const { stub } = renderLayout({
      ...workspaceHandlers(),
      [ENV_URL]: createdWith({ id: ENV_ID, key: 'prod', name: 'Production' }, [
        { key: 'flagStates', label: 'flag states', count: 254 },
        { key: 'toolConfigs', label: 'config values', count: 12 },
      ]),
    });
    await ready();

    const name = await openCreate();
    fireEvent.change(name, { target: { value: 'Load Testing' } });
    expect(screen.getByLabelText('Key')).toHaveProperty('value', 'load-testing');
    // Production is the selected environment, so it is the pre-selected source.
    expect(screen.getByLabelText('Inherit from')).toHaveProperty('value', ENV_ID);

    stub.set({ [`GET /v1/projects/${PROJECT_ID}/environments`]: [...environments(), newEnv] });
    fireEvent.click(screen.getByText('Create environment', { selector: 'button' }));

    // The confirmation is built from the API's own labels and counts.
    await waitFor(() =>
      expect(
        screen.getAllByText(
          /Load Testing.*created with 254 flag states and 12 config values from Production/,
        ).length,
      ).toBeGreaterThan(0),
    );
    expect(postBody(stub)).toEqual({
      key: 'load-testing',
      name: 'Load Testing',
      inheritFromEnvironmentId: ENV_ID,
    });
  });

  it('offers every environment plus a blank option as the source', async () => {
    renderLayout();
    await ready();
    await openCreate();

    const options = [...screen.getByLabelText('Inherit from').querySelectorAll('option')].map(
      (o) => o.textContent,
    );
    expect(options).toEqual([
      'Production (prod)',
      'Development (dev)',
      'Blank environment — start with nothing',
    ]);
  });

  it('sends no source when Blank is chosen, and says so', async () => {
    const { stub } = renderLayout({
      ...workspaceHandlers(),
      [ENV_URL]: createdWith(null),
    });
    await ready();

    const name = await openCreate();
    fireEvent.change(name, { target: { value: 'Load Testing' } });
    fireEvent.change(screen.getByLabelText('Inherit from'), { target: { value: 'blank' } });
    expect(screen.getByText(/Every flag starts off with no config/)).toBeTruthy();

    stub.set({ [`GET /v1/projects/${PROJECT_ID}/environments`]: [...environments(), newEnv] });
    fireEvent.click(screen.getByText('Create environment', { selector: 'button' }));

    await waitFor(() =>
      expect(screen.getAllByText(/Environment “Load Testing” created$/).length).toBeGreaterThan(0),
    );
    expect(postBody(stub)).toMatchObject({ inheritFromEnvironmentId: null });
  });

  it('explains inheritance, naming the chosen source', async () => {
    renderLayout();
    await ready();
    await openCreate();

    expect(screen.getByText(/one-time snapshot/)).toBeTruthy();
    expect(screen.getByText(/API keys are never copied/)).toBeTruthy();
    // The helper text follows the selection.
    fireEvent.change(screen.getByLabelText('Inherit from'), { target: { value: DEV_ENV_ID } });
    expect(
      screen.getByText((_, node) => node?.textContent?.includes('from Development') === true, {
        selector: '#env-inherit-hint',
      }),
    ).toBeTruthy();
  });

  it('reports an inherited source that had nothing to copy', async () => {
    const { stub } = renderLayout({
      ...workspaceHandlers(),
      [ENV_URL]: createdWith({ id: ENV_ID, key: 'prod', name: 'Production' }, [
        { key: 'flagStates', label: 'flag states', count: 0 },
      ]),
    });
    await ready();

    const name = await openCreate();
    fireEvent.change(name, { target: { value: 'Load Testing' } });
    stub.set({ [`GET /v1/projects/${PROJECT_ID}/environments`]: [...environments(), newEnv] });
    fireEvent.click(screen.getByText('Create environment', { selector: 'button' }));

    await waitFor(() =>
      expect(screen.getAllByText(/Production had nothing to copy/).length).toBeGreaterThan(0),
    );
  });

  it('refuses a key the API would reject', async () => {
    renderLayout();
    await ready();

    const menu = await openPicker(/^Environment: Production$/);
    fireEvent.click(within(menu).getByText('Create environment'));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'QA' } });
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: '-nope!' } });

    expect(screen.getByText('Create environment', { selector: 'button' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByText(/Lowercase letters, digits and dashes only/)).toBeTruthy();
  });

  it('is not offered to a developer', async () => {
    renderLayout(workspaceHandlers('developer'));
    await ready();
    const menu = await openPicker(/^Environment: Production$/);
    expect(
      within(menu)
        .getByRole('menuitem', { name: 'Create environment' })
        .getAttribute('data-disabled'),
    ).not.toBeNull();
  });
});

describe('environment colour', () => {
  it('marks production and development differently', async () => {
    renderLayout();
    await ready();
    const menu = await openPicker(/^Environment: Production$/);

    const prod = within(menu).getByRole('menuitemradio', { name: /Production/ });
    const dev = within(menu).getByRole('menuitemradio', { name: /Development/ });
    expect(prod.querySelector('.bg-off')).toBeTruthy();
    // `bg-primary`, not `bg-accent`: shadcn owns the word `accent` for its hover
    // surface, so the brand colour moved to `primary` when the design system
    // landed. `bg-off` is product-specific and kept its name.
    expect(dev.querySelector('.bg-primary')).toBeTruthy();
    // Colour is never the only signal - both rows also carry their key.
    expect(within(menu).getByText('prod')).toBeTruthy();
    expect(within(menu).getByText('dev')).toBeTruthy();
  });
});
