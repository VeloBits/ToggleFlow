// @vitest-environment happy-dom
/**
 * The Flags page with nothing to list: no organization, no project, no
 * environment, and a project whose flag list is empty.
 *
 * ## Why this is its own suite
 *
 * Every case here is decided *before* the flags query is consulted, which is the
 * whole point of the fix it covers: `flagsQueryOptions` is disabled without an
 * environment, and a disabled react-query reports `isPending` forever - so a
 * project-less organization used to sit on the table's loading skeleton
 * indefinitely, for a request that was never going to be made. Asserting that
 * ordering needs handler tables with pieces of the workspace *missing*, which is
 * the opposite of what `flags-page.test.tsx` sets up for every one of its tests.
 */
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FlagsPage } from '../src/features/flags';
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
  type Handlers,
} from './harness';

/**
 * The workspace's three requests, spelled out rather than taken from
 * `workspaceHandlers()`, because every test here answers at least one of them
 * with an empty list and the point is which one.
 */
const workspace = ({
  role = 'admin' as ReturnType<typeof me>['orgs'][number]['role'],
  projects = [project()],
  envs = environments(),
}: {
  role?: 'admin' | 'developer' | 'viewer';
  projects?: ReturnType<typeof project>[];
  envs?: ReturnType<typeof environments>;
} = {}): Handlers => ({
  'GET /v1/me': me(role),
  [`GET /v1/orgs/${ORG_ID}/projects`]: projects,
  [`GET /v1/projects/${PROJECT_ID}/environments`]: envs,
});

function renderPage(handlers: Handlers) {
  stubAuth();
  const stub = stubFetch(handlers);
  renderWithProviders(<FlagsPage />);
  return { stub };
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('no project', () => {
  /** The handler table an org with no projects produces: no environments call at all. */
  const noProjects = (role: 'admin' | 'developer' | 'viewer' = 'admin'): Handlers => ({
    'GET /v1/me': me(role),
    [`GET /v1/orgs/${ORG_ID}/projects`]: [],
  });

  it('offers to create a project instead of a skeleton that never resolves', async () => {
    renderPage(noProjects());
    await waitFor(() =>
      expect(screen.getByText('Create a project to start using flags')).toBeTruthy(),
    );
    // The skeleton's live region is the thing that used to be here forever.
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: /Create project/ })).toBeTruthy();
  });

  it('creates the project through the same dialog the topbar picker uses', async () => {
    const { stub } = renderPage({
      ...noProjects(),
      // Answered for the refetch `createProject` triggers; the project it
      // returns is the one the workspace then selects.
      [`POST /v1/orgs/${ORG_ID}/projects`]: { status: 201, body: project() },
      [`GET /v1/projects/${PROJECT_ID}/environments`]: environments(),
      [`GET /v1/environments/${ENV_ID}/flags`]: [],
      [`GET /v1/projects/${PROJECT_ID}/tools`]: [],
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Create project/ })).toBeTruthy(),
    );

    fireEvent.click(screen.getByRole('button', { name: /Create project/ }));
    // NameDialog's field, not a copy of it - same title as the topbar's flow.
    const field = await waitFor(() => screen.getByLabelText('Name'));
    fireEvent.change(field, { target: { value: 'Checkout service' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() =>
      expect(stub.calls.some((call) => call.key === `POST /v1/orgs/${ORG_ID}/projects`)).toBe(true),
    );
    expect(stub.calls.find((c) => c.key === `POST /v1/orgs/${ORG_ID}/projects`)?.body).toEqual({
      name: 'Checkout service',
    });
  });

  it('tells a non-admin who can fix it, and offers no button they cannot use', async () => {
    renderPage(noProjects('developer'));
    await waitFor(() =>
      expect(screen.getByText(/An admin needs to create the first one/)).toBeTruthy(),
    );
    expect(screen.queryByRole('button', { name: /Create project/ })).toBeNull();
  });
});

describe('no organization', () => {
  it('points at the org picker rather than a project button that would 404', async () => {
    // `me` with no orgs leaves orgId null, so there is no URL to POST a project
    // to - the CTA has to be absent, not merely disabled.
    renderPage({ 'GET /v1/me': { user: me().user, orgs: [] } });
    await waitFor(() =>
      expect(screen.getByText('Create an organization to start using flags')).toBeTruthy(),
    );
    expect(screen.queryByRole('button', { name: /Create project/ })).toBeNull();
  });
});

describe('no environment', () => {
  it('says the project has none and links to where they are managed', async () => {
    renderPage({
      ...workspace({ envs: [] }),
      // Enabled by the project, unlike the flags query, so it still fires.
      [`GET /v1/projects/${PROJECT_ID}/tools`]: [],
    });
    await waitFor(() => expect(screen.getByText('Control Plane has no environments')).toBeTruthy());
    expect(screen.getByRole('link', { name: 'Manage environments' }).getAttribute('href')).toBe(
      '/environments',
    );
  });
});

describe('no flags', () => {
  const noFlags = (role: 'admin' | 'developer' | 'viewer' = 'admin'): Handlers => ({
    ...workspace({ role }),
    [`GET /v1/environments/${ENV_ID}/flags`]: [],
    [`GET /v1/projects/${PROJECT_ID}/tools`]: [],
  });

  it('names the project, offers the first flag, and explains what one is for', async () => {
    renderPage(noFlags());
    await waitFor(() => expect(screen.getByText('No flags in Control Plane yet')).toBeTruthy());
    expect(screen.getByRole('button', { name: /Create your first flag/ })).toBeTruthy();
    // The three steps are the answer to "should I be using this at all", which
    // is the question an empty first screen actually raises.
    expect(screen.getByText('Create a flag')).toBeTruthy();
    expect(screen.getByText('Read it from your SDK')).toBeTruthy();
    expect(screen.getByText('Change it without a deploy')).toBeTruthy();
  });

  it('opens the create dialog from the empty state', async () => {
    renderPage(noFlags());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Create your first flag/ })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Create your first flag/ }));
    await waitFor(() => expect(screen.getByLabelText('Key')).toBeTruthy());
  });

  it('gives a viewer the explanation and no button', async () => {
    renderPage(noFlags('viewer'));
    await waitFor(() => expect(screen.getByText('No flags in Control Plane yet')).toBeTruthy());
    expect(screen.getByText(/developer or admin role to create one/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Create your first flag/ })).toBeNull();
  });
});
