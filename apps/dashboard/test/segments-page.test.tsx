// @vitest-environment happy-dom
/**
 * The Segments list: reading a segment without reading JSON, searching by
 * condition, the usage column, and the create flow's hand-off to the detail page.
 *
 * The suite this replaced tested a JSON textarea - typing
 * `[{"attribute":"plan",…}]` into a field and asserting on `Not valid JSON.`
 * That page is gone, and so is the class of test that goes with it: there is no
 * longer a way to express a malformed condition, which is the point of the
 * redesign rather than a gap in coverage.
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SegmentUsage } from '../src/api/client';
import { SegmentsPage } from '../src/features/segments';
import {
  ENV_ID,
  PROJECT_ID,
  renderWithProviders,
  segmentRow,
  stubAuth,
  stubFetch,
  workspaceHandlers,
  type FetchStub,
  type Handlers,
} from './harness';

const SEGMENTS_URL = `/v1/projects/${PROJECT_ID}/segments`;
const USAGE_URL = `${SEGMENTS_URL}/usage`;

const usage = (over: Partial<SegmentUsage> = {}): SegmentUsage => ({
  flagCount: 1,
  references: [
    {
      flagId: 't1',
      flagKey: 'tool.summarize',
      flagName: 'Summarize',
      environmentId: ENV_ID,
      environmentKey: 'prod',
      environmentName: 'Production',
    },
  ],
  ...over,
});

const pageHandlers = (
  role: 'admin' | 'developer' | 'viewer' = 'admin',
  over: Handlers = {},
): Handlers => ({
  ...workspaceHandlers(role),
  [`GET ${SEGMENTS_URL}`]: [segmentRow()],
  [`GET ${USAGE_URL}`]: {},
  ...over,
});

/** Reports where a navigation landed, so the create hand-off is observable. */
function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}

function renderPage(handlers: Handlers = pageHandlers()): { stub: FetchStub } {
  stubAuth();
  const stub = stubFetch(handlers);
  renderWithProviders(
    <>
      <LocationProbe />
      <Routes>
        <Route path="/segments" element={<SegmentsPage />} />
        {/* Where the create flow and a row click both go. */}
        <Route path="/segments/:segmentId" element={<span>detail stub</span>} />
      </Routes>
    </>,
    { route: '/segments' },
  );
  return { stub };
}

/*
 * The table and the card list are BOTH mounted on every paint and CSS picks one
 * at the `md` breakpoint - which happy-dom does not apply - so every row is in
 * the tree twice. Assertions scope to one of them on purpose; an unscoped
 * `getByText` throws on the duplicate.
 */
const inTable = () => within(screen.getByRole('table', { name: 'Segments' }));
const inCards = () => within(screen.getByRole('list', { name: 'Segments (compact)' }));

const loaded = () => waitFor(() => expect(inTable().getByText('beta-users')).toBeTruthy());

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('listing', () => {
  it('renders the rules in words rather than as JSON', async () => {
    renderPage();
    await loaded();
    const table = inTable();
    expect(table.getByText('Beta users')).toBeTruthy();
    expect(table.getByText('Opted in')).toBeTruthy();
    // The whole point: `plan is one of pro`, not `[{"attribute":"plan",…}]`.
    expect(table.getByText('plan is one of pro')).toBeTruthy();
    expect(screen.queryByText(/\{"attribute"/)).toBeNull();

    // The card list carries the same reading, so a phone is not sent back to JSON.
    expect(inCards().getByText('plan is one of pro')).toBeTruthy();
  });

  it('labels a segment with no conditions as matching everyone', async () => {
    renderPage(pageHandlers('admin', { [`GET ${SEGMENTS_URL}`]: [segmentRow({ rules: [[]] })] }));
    await loaded();
    const table = inTable();
    expect(table.getByText('Everyone')).toBeTruthy();
    expect(table.getByText('No conditions')).toBeTruthy();
  });

  it('summarises an ORed segment by its shape', async () => {
    renderPage(
      pageHandlers('admin', {
        [`GET ${SEGMENTS_URL}`]: [
          segmentRow({
            match: 'any',
            rules: [
              [
                { attribute: 'plan', operator: 'eq', value: 'pro' },
                { attribute: 'region', operator: 'eq', value: 'eu' },
              ],
              [{ attribute: 'country', operator: 'eq', value: 'us' }],
            ],
          }),
        ],
      }),
    );
    await loaded();
    // Groups collapse to their first condition plus a count - a cell wide enough
    // for two groups in full is a cell too wide for a table.
    const table = inTable();
    expect(table.getByText('(plan is pro +1) OR (country is us)')).toBeTruthy();
    expect(table.getByText('2 rule sets (OR)')).toBeTruthy();
  });

  it('shows usage once the count arrives, and Unused when there is none', async () => {
    renderPage(pageHandlers('admin', { [`GET ${USAGE_URL}`]: { 'beta-users': usage() } }));
    await loaded();
    await waitFor(() => expect(inTable().getByText(/1 reference/)).toBeTruthy());
    // The environment is named beside the count, so "used where" needs no click.
    expect(inTable().getByText(/Production/)).toBeTruthy();

    cleanup();
    renderPage();
    await loaded();
    await waitFor(() => expect(inTable().getByText('Unused')).toBeTruthy());
  });

  it('keeps the list usable when the usage request fails', async () => {
    // A missing count is a degraded column, not a broken page.
    renderPage(
      pageHandlers('admin', {
        [`GET ${USAGE_URL}`]: { status: 500, body: { error: 'boom', message: 'usage exploded' } },
      }),
    );
    await loaded();
    expect(inTable().getByText('plan is one of pro')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('usage exploded')).toBeTruthy());
  });

  it('opens the detail route when a row is clicked', async () => {
    renderPage();
    await loaded();
    fireEvent.click(inTable().getByText('Beta users'));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/segments/s1'));
  });

  it('surfaces a load failure', async () => {
    renderPage(
      pageHandlers('admin', {
        [`GET ${SEGMENTS_URL}`]: {
          status: 403,
          body: { error: 'forbidden', message: 'no access' },
        },
      }),
    );
    await waitFor(() => expect(screen.getByText('no access')).toBeTruthy());
  });

  it('hides the create button from a viewer', async () => {
    renderPage(pageHandlers('viewer'));
    await loaded();
    expect(screen.queryByText('Create segment')).toBeNull();
  });
});

describe('search', () => {
  const twoSegments = (): Handlers =>
    pageHandlers('admin', {
      [`GET ${SEGMENTS_URL}`]: [
        segmentRow(),
        segmentRow({
          id: 's2',
          key: 'eu-users',
          name: 'EU users',
          description: null,
          rules: [[{ attribute: 'region', operator: 'eq', value: 'eu' }]],
        }),
      ],
    });

  it('filters by name', async () => {
    renderPage(twoSegments());
    await loaded();
    fireEvent.change(screen.getByLabelText('Search segments'), { target: { value: 'EU' } });
    expect(screen.queryByText('Beta users')).toBeNull();
    expect(inTable().getByText('EU users')).toBeTruthy();
  });

  it('filters by condition, which names alone cannot answer', async () => {
    renderPage(twoSegments());
    await loaded();
    // "which segment targets on region?" - the question that motivates searching
    // the conditions at all.
    fireEvent.change(screen.getByLabelText('Search segments'), { target: { value: 'region' } });
    expect(inTable().getByText('EU users')).toBeTruthy();
    expect(screen.queryByText('Beta users')).toBeNull();
  });

  it('offers a way back when nothing matches', async () => {
    renderPage(twoSegments());
    await loaded();
    fireEvent.change(screen.getByLabelText('Search segments'), { target: { value: 'zzz' } });
    expect(screen.getByText('No segments match')).toBeTruthy();

    fireEvent.click(screen.getByText('Clear search'));
    expect(inTable().getByText('Beta users')).toBeTruthy();
  });
});

describe('empty state', () => {
  it('explains what a segment is for and offers the first one', async () => {
    renderPage(pageHandlers('admin', { [`GET ${SEGMENTS_URL}`]: [] }));
    await waitFor(() => expect(screen.getByText('No segments yet')).toBeTruthy());
    expect(screen.getByText(/Describe a group of users once/)).toBeTruthy();
    expect(screen.getByText('Create segment')).toBeTruthy();
  });

  it('tells a viewer who can create one instead of offering the button', async () => {
    renderPage(pageHandlers('viewer', { [`GET ${SEGMENTS_URL}`]: [] }));
    await waitFor(() => expect(screen.getByText('No segments yet')).toBeTruthy());
    expect(screen.getByText(/Ask an admin or developer/)).toBeTruthy();
    expect(screen.queryByText('Create segment')).toBeNull();
  });
});

describe('create', () => {
  const opened = async () => {
    renderPage(
      pageHandlers('admin', {
        [`POST ${SEGMENTS_URL}`]: segmentRow({ id: 's9', key: 'power-users' }),
      }),
    );
    await loaded();
    fireEvent.click(screen.getByText('Create segment'));
    await waitFor(() => expect(screen.getByLabelText('Name')).toBeTruthy());
  };

  it('derives the key from the name until the key is edited', async () => {
    await opened();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Power Users' } });
    expect(screen.getByLabelText('Key')).toHaveProperty('value', 'power-users');

    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'custom.key' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed' } });
    // Once touched, the key stops following the name.
    expect(screen.getByLabelText('Key')).toHaveProperty('value', 'custom.key');
  });

  it('posts the segment and lands on its rule builder', async () => {
    stubAuth();
    const stub = stubFetch(
      pageHandlers('admin', {
        [`POST ${SEGMENTS_URL}`]: segmentRow({ id: 's9', key: 'power-users' }),
      }),
    );
    renderWithProviders(
      <>
        <LocationProbe />
        <Routes>
          <Route path="/segments" element={<SegmentsPage />} />
          <Route path="/segments/:segmentId" element={<span>detail stub</span>} />
        </Routes>
      </>,
      { route: '/segments' },
    );
    await loaded();

    fireEvent.click(screen.getByText('Create segment'));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' Power Users ' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: ' notes ' } });
    fireEvent.click(screen.getByText('Create segment', { selector: 'button[type="submit"]' }));

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/segments/s9'));
    // No `rules` in the body: the API defaults to one empty group and the builder
    // on the next screen is where conditions get added.
    expect(stub.calls.find((c) => c.key === `POST ${SEGMENTS_URL}`)?.body).toEqual({
      key: 'power-users',
      name: 'Power Users',
      description: 'notes',
    });
  });

  it('refuses an empty name without calling the API', async () => {
    stubAuth();
    const stub = stubFetch(pageHandlers());
    renderWithProviders(
      <Routes>
        <Route path="/segments" element={<SegmentsPage />} />
      </Routes>,
      { route: '/segments' },
    );
    await loaded();

    fireEvent.click(screen.getByText('Create segment'));
    fireEvent.click(screen.getByText('Create segment', { selector: 'button[type="submit"]' }));

    await waitFor(() => expect(screen.getByText('A name is required.')).toBeTruthy());
    expect(stub.calls.some((c) => c.key.startsWith('POST'))).toBe(false);
  });

  it('surfaces a duplicate key and keeps the dialog open', async () => {
    renderPage(
      pageHandlers('admin', {
        [`POST ${SEGMENTS_URL}`]: {
          status: 409,
          body: { error: 'conflict', message: 'key already used' },
        },
      }),
    );
    await loaded();

    fireEvent.click(screen.getByText('Create segment'));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Beta users' } });
    fireEvent.click(screen.getByText('Create segment', { selector: 'button[type="submit"]' }));

    await waitFor(() => expect(screen.getByText('key already used')).toBeTruthy());
    expect(screen.getByLabelText('Name')).toBeTruthy();
  });

  it('closes on cancel', async () => {
    await opened();
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => expect(screen.queryByLabelText('Name')).toBeNull());
  });
});
