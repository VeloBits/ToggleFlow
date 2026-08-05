// @vitest-environment happy-dom
/**
 * Bulk selection and the bulk actions: the checkbox column, the bar, what each
 * action patches and what it refuses to, partial failure, the rollout dialog and
 * the production gate.
 *
 * ## Convention: always scope a list assertion to one layout
 *
 * The table and the cards are both mounted on every paint (see FlagsTable), so
 * every row - and every row checkbox - is in the DOM twice. `inTable()` and
 * `inCards()` below; the bar itself is single, and `bar()` scopes to it so
 * "Clear" cannot collide with anything the toolbar grows later.
 *
 * ## Convention: ENV_ID is production
 *
 * `renderPage` selects the *dev* environment, because on production every
 * immediate action arms before it fires - otherwise every assertion here would
 * quietly be exercising the confirm path. `renderProdPage` opts back in.
 *
 * ## The fixture
 *
 * Five live rows, chosen so each action leaves some of them alone and no skip
 * report is a single row of a single state: two off (banner, translate), two on
 * (model, summarize), one rolling out (rewrite), plus an archived one that only
 * appears once "Show archived flags" is ticked.
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FlagsPage } from '../src/features/flags';
import { useWorkspace } from '../src/state/WorkspaceContext';
import {
  DEV_ENV_ID,
  ENV_ID,
  PROJECT_ID,
  dynamic,
  flagRow,
  renderWithProviders,
  stubAuth,
  stubFetch,
  workspaceHandlers,
  type FetchStub,
  type Handlers,
} from './harness';

const ROWS = [
  flagRow({ id: 't1', key: 'tool.summarize', name: 'Summarize' }),
  flagRow({ id: 't2', key: 'tool.translate', name: 'Translate', enabled: false }),
  flagRow({ id: 't3', key: 'tool.rewrite', name: 'Rewrite', rolloutPercent: 25 }),
  flagRow({ id: 't4', key: 'tool.legacy', name: 'Legacy', archived: true }),
  flagRow({
    id: 't5',
    key: 'tool.banner',
    name: 'Banner copy',
    enabled: false,
    valueType: 'string',
    value: 'Deploys are faster',
  }),
  flagRow({ id: 't6', key: 'tool.model', name: 'Model choice' }),
];

const ALL_IDS = ['t1', 't2', 't3', 't4', 't5', 't6'];

const patchOf = (flagId: string, envId: string = DEV_ENV_ID) =>
  `PATCH /v1/environments/${envId}/tools/${flagId}/flag`;

/** Every flag patchable, so a test only declares the ones it wants to behave differently. */
const patchesOk = (envId: string = DEV_ENV_ID, ids: string[] = ALL_IDS): Handlers =>
  Object.fromEntries(ids.map((id) => [patchOf(id, envId), {}]));

const flagsFor = (envId: string, rows: unknown = ROWS) => ({
  [`GET /v1/environments/${envId}/flags`]: rows,
});

const pageHandlers = (
  role: 'admin' | 'developer' | 'viewer' = 'admin',
  over: Handlers = {},
): Handlers => ({
  ...workspaceHandlers(role),
  ...flagsFor(ENV_ID),
  ...flagsFor(DEV_ENV_ID),
  // Tags and descriptions are another agent's column; an empty definition list
  // keeps this suite to the rows themselves.
  [`GET /v1/projects/${PROJECT_ID}/tools`]: [],
  ...patchesOk(DEV_ENV_ID),
  ...patchesOk(ENV_ID),
  ...over,
});

/** Renders against DEVELOPMENT, where an immediate action fires on one gesture. */
function renderPage(handlers: Handlers = pageHandlers()): { stub: FetchStub } {
  localStorage.setItem('tf.environment', DEV_ENV_ID);
  stubAuth();
  const stub = stubFetch(handlers);
  renderWithProviders(<FlagsPage />);
  return { stub };
}

/** Renders against PRODUCTION, where every immediate action arms first. */
function renderProdPage(handlers: Handlers = pageHandlers()): { stub: FetchStub } {
  stubAuth();
  const stub = stubFetch(handlers);
  renderWithProviders(<FlagsPage />);
  return { stub };
}

const inTable = () => within(screen.getByRole('table', { name: 'Flags' }));
const inCards = () => within(screen.getByRole('list', { name: 'Flags (compact)' }));
const bar = () => within(screen.getByRole('group', { name: 'Bulk actions' }));
const noBar = () => expect(screen.queryByRole('group', { name: 'Bulk actions' })).toBeNull();

const rowBox = (key: string) => inTable().getByLabelText(`Select ${key}`);
const headerBox = () => inTable().getByLabelText('Select all flags on this page');
const action = (name: string | RegExp) => bar().getByRole('button', { name });

const tableKeys = () =>
  inTable()
    .queryAllByRole('button', { name: /^Copy key / })
    .map((button) => button.getAttribute('aria-label')!.replace('Copy key ', ''));
const waitForRows = () => waitFor(() => expect(tableKeys().length).toBeGreaterThan(0));

const patchCalls = (stub: FetchStub) => stub.calls.filter((call) => call.key.startsWith('PATCH'));
const listFetches = (stub: FetchStub, envId: string = DEV_ENV_ID) =>
  stub.calls.filter((call) => call.key === `GET /v1/environments/${envId}/flags`);

const showArchived = async () => {
  fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
  await waitFor(() => expect(screen.getByLabelText('Show archived flags')).toBeTruthy());
  fireEvent.click(screen.getByLabelText('Show archived flags'));
  await waitFor(() => expect(tableKeys()).toContain('tool.legacy'));
};

/** Switches environment the way the topbar does; FlagsPage renders without the shell. */
function EnvironmentSwitch() {
  const ws = useWorkspace();
  return (
    <button type="button" onClick={() => ws.selectEnvironment(ENV_ID)}>
      go to prod
    </button>
  );
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('selecting rows', () => {
  it('appears with one row ticked, counting what each action will change', async () => {
    renderPage();
    await waitForRows();
    noBar();

    fireEvent.click(rowBox('tool.summarize'));
    expect(bar().getByText('1 flag selected')).toBeTruthy();
    expect(action('Disable 1 flag')).toBeTruthy();

    // Already on, so Enable has nothing to do - and says so on the page rather
    // than disappearing and leaving the absence to be decoded.
    const enable = action('Enable 0 flags');
    expect(enable.hasAttribute('disabled')).toBe(true);
    expect(enable.getAttribute('title')).toBe(
      'Leaves 1 of the selected flags alone: 1 already on.',
    );

    // Unticking the last row takes the bar with it.
    fireEvent.click(rowBox('tool.summarize'));
    noBar();
  });

  it('selects every row on screen from the header, showing the mixed state in between', async () => {
    renderPage();
    await waitForRows();

    fireEvent.click(rowBox('tool.summarize'));
    expect(headerBox().getAttribute('data-state')).toBe('indeterminate');

    fireEvent.click(headerBox());
    expect(bar().getByText('5 flags selected')).toBeTruthy();
    expect(headerBox().getAttribute('data-state')).toBe('checked');

    // Everything on screen ticked, so the header is now a clear.
    fireEvent.click(headerBox());
    noBar();
  });

  it('clears from the button and from Escape, and ignores every other key', async () => {
    renderPage();
    await waitForRows();

    fireEvent.click(rowBox('tool.summarize'));
    fireEvent.click(action('Clear'));
    noBar();

    fireEvent.click(rowBox('tool.summarize'));
    fireEvent.keyDown(document.body, { key: 'a' });
    expect(bar().getByText('1 flag selected')).toBeTruthy();
    // Escape from anywhere in the list: focus is still on the checkbox.
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => noBar());
  });

  it('drives the same bar from a card, below md', async () => {
    renderPage();
    await waitForRows();
    fireEvent.click(inCards().getByLabelText('Select tool.model'));
    expect(bar().getByText('1 flag selected')).toBeTruthy();
  });
});

describe('enable and disable', () => {
  it('patches only the rows the action applies to, once each, and refetches once', async () => {
    const { stub } = renderPage();
    await waitForRows();
    fireEvent.click(headerBox());

    const enable = action('Enable 2 flags');
    expect(enable.getAttribute('title')).toBe(
      'Leaves 3 of the selected flags alone: 1 already rolling out, 2 already on.',
    );
    fireEvent.click(enable);

    await waitFor(() => expect(patchCalls(stub)).toHaveLength(2));
    expect(
      patchCalls(stub)
        .map((call) => call.key)
        .sort(),
    ).toEqual([patchOf('t2'), patchOf('t5')].sort());
    expect(patchCalls(stub).map((call) => call.body)).toEqual([
      { enabled: true },
      { enabled: true },
    ]);
    await waitFor(() => expect(screen.getByText('Turned on 2 flags')).toBeTruthy());

    // One invalidation for the run, not one per row.
    expect(listFetches(stub)).toHaveLength(2);
    // A clean run consumes the selection.
    noBar();
  });

  it('leaves an archived flag alone even when it is selected', async () => {
    const { stub } = renderPage();
    await waitForRows();
    await showArchived();
    fireEvent.click(headerBox());

    const disable = action('Disable 3 flags');
    expect(disable.getAttribute('title')).toBe(
      'Leaves 3 of the selected flags alone: 2 already off, 1 archived.',
    );
    fireEvent.click(disable);

    await waitFor(() => expect(patchCalls(stub)).toHaveLength(3));
    // Archived flags are dropped from every published snapshot, so patching one
    // is an audit entry and a publish for a change nobody serves.
    expect(patchCalls(stub).some((call) => call.key === patchOf('t4'))).toBe(false);
    expect(patchCalls(stub).map((call) => call.body)).toEqual([
      { enabled: false },
      { enabled: false },
      { enabled: false },
    ]);
  });

  it('reports a partial failure honestly and keeps the selection for the retry', async () => {
    const { stub } = renderPage(
      pageHandlers('admin', {
        [patchOf('t3')]: { status: 403, body: { error: 'forbidden', message: 'Not your project' } },
      }),
    );
    await waitForRows();
    fireEvent.click(headerBox());
    fireEvent.click(action('Disable 3 flags'));

    // One toast for three requests, naming the one that did not land.
    await waitFor(() =>
      expect(
        screen.getByText('Turned off 2 flags. 1 failed (Not your project): tool.rewrite'),
      ).toBeTruthy(),
    );
    expect(patchCalls(stub)).toHaveLength(3);
    // Kept: each action's own predicate has already narrowed to what still needs
    // doing, so the retry is the same button with a smaller count.
    expect(bar().getByText('5 flags selected')).toBeTruthy();
  });

  it('names the first few failures and counts the rest when everything fails', async () => {
    const rows = ['a', 'b', 'c', 'd', 'e'].map((suffix, index) =>
      flagRow({
        id: `f${index}`,
        key: `tool.f${suffix}`,
        name: `Flag ${suffix}`,
        enabled: false,
      }),
    );
    const { stub } = renderPage(
      pageHandlers('admin', {
        ...flagsFor(DEV_ENV_ID, rows),
        // Rejected with a bare string rather than an Error, which is the branch a
        // network failure takes.
        ...Object.fromEntries(
          rows.map((row) => [patchOf(row.toolId), dynamic(() => Promise.reject('offline'))]),
        ),
      }),
    );
    await waitForRows();
    fireEvent.click(headerBox());
    fireEvent.click(action('Enable 5 flags'));

    await waitFor(() => expect(patchCalls(stub)).toHaveLength(5));
    // No "Turned on 0 flags" opener: nothing was turned on.
    await waitFor(() =>
      expect(
        screen.getByText(/^5 failed \(Update failed\): tool\.f., tool\.f., tool\.f. \+2 more$/),
      ).toBeTruthy(),
    );
  });

  it('disables itself and reports progress while a run is in flight', async () => {
    let release!: () => void;
    const held = new Promise<{ status: number; body: unknown }>((resolve) => {
      release = () => resolve({ status: 200, body: {} });
    });
    const { stub } = renderPage(
      pageHandlers('admin', {
        [patchOf('t2')]: dynamic(() => held),
        [patchOf('t5')]: dynamic(() => held),
      }),
    );
    await waitForRows();
    fireEvent.click(headerBox());
    fireEvent.click(action('Enable 2 flags'));

    await waitFor(() => expect(bar().getByRole('status').textContent).toBe('0 of 2 done…'));
    expect(action('Enable 2 flags').hasAttribute('disabled')).toBe(true);
    expect(action('Clear').hasAttribute('disabled')).toBe(true);
    // Escape must not pull the selection out from under a run in flight.
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(bar().getByText('5 flags selected')).toBeTruthy();

    release();
    await waitFor(() => expect(screen.getByText('Turned on 2 flags')).toBeTruthy());
    expect(patchCalls(stub)).toHaveLength(2);
  });
});

describe('configure rollout', () => {
  it('applies a percentage to every selected flag, turning the off ones on', async () => {
    const { stub } = renderPage();
    await waitForRows();
    fireEvent.click(headerBox());
    fireEvent.click(action('Configure rollout…'));

    expect(screen.getByText('Configure rollout for 5 flags')).toBeTruthy();
    // Stated before the button is pressed, not discovered afterwards.
    expect(
      screen.getByText(/Any of these that are off will be turned on — 2 flags right now/),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '25%' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply to 5 flags' }));

    await waitFor(() => expect(patchCalls(stub)).toHaveLength(5));
    expect(patchCalls(stub).map((call) => call.body)).toEqual(
      Array.from({ length: 5 }, () => ({ rolloutPercent: 25, enabled: true })),
    );
    await waitFor(() => expect(screen.getByText('Rollout set on 5 flags')).toBeTruthy());
  });

  it('sends null for everyone, and says what that means', async () => {
    const { stub } = renderPage();
    await waitForRows();
    fireEvent.click(rowBox('tool.summarize'));
    fireEvent.click(action('Configure rollout…'));

    // Nothing in this selection is off, so nothing is claimed about turning any on.
    expect(screen.queryByText(/will be turned on/)).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'Everyone' }));
    expect(screen.getByText('Serves every user in Development while the flag is on.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Apply to 1 flag' }));

    await waitFor(() => expect(patchCalls(stub)).toHaveLength(1));
    expect(patchCalls(stub)[0]!.body).toEqual({ rolloutPercent: null, enabled: true });
  });

  it('closes on Escape without dropping the selection', async () => {
    renderPage();
    await waitForRows();
    fireEvent.click(headerBox());
    fireEvent.click(action('Configure rollout…'));

    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('Configure rollout for 5 flags')).toBeNull());
    // Escape belonged to the dialog; the selection is still there.
    expect(bar().getByText('5 flags selected')).toBeTruthy();
  });
});

describe('production', () => {
  it('asks twice before a bulk disable, naming the environment and the count', async () => {
    const { stub } = renderProdPage();
    await waitForRows();
    fireEvent.click(rowBox('tool.summarize'));

    fireEvent.click(action('Disable 1 flag'));
    // The first gesture arms; nothing has been sent.
    expect(patchCalls(stub)).toHaveLength(0);

    fireEvent.click(action('Confirm in Production — Disable 1 flag'));
    await waitFor(() => expect(patchCalls(stub)).toHaveLength(1));
    expect(patchCalls(stub)[0]!.key).toBe(patchOf('t1', ENV_ID));
  });

  it('arms the non-destructive actions too', async () => {
    const { stub } = renderProdPage();
    await waitForRows();
    fireEvent.click(rowBox('tool.translate'));

    // Enabling twelve flags at once is also a change to what production serves; a
    // bar where only some gestures are guarded teaches that the rest are safe.
    fireEvent.click(action('Enable 1 flag'));
    expect(patchCalls(stub)).toHaveLength(0);
    expect(action(/^Confirm in Production/)).toBeTruthy();
  });

  it('disarms when the selection moves under it', async () => {
    const { stub } = renderProdPage();
    await waitForRows();
    fireEvent.click(rowBox('tool.summarize'));
    fireEvent.click(action('Disable 1 flag'));
    expect(action(/^Confirm in Production/)).toBeTruthy();

    fireEvent.click(rowBox('tool.model'));
    // An armed "Disable 1 flag" must not become an armed "Disable 2 flags".
    expect(bar().queryByRole('button', { name: /^Confirm in Production/ })).toBeNull();
    expect(action('Disable 2 flags')).toBeTruthy();
    expect(patchCalls(stub)).toHaveLength(0);
  });

  it('names the environment on the rollout dialog instead of arming the button', async () => {
    const { stub } = renderProdPage();
    await waitForRows();
    fireEvent.click(rowBox('tool.summarize'));
    fireEvent.click(action('Configure rollout…'));

    expect(screen.getByText(/This changes what Production serves/)).toBeTruthy();
    // Reaching a dialog's submit is already the second gesture - the call
    // FlagStatePanel makes about its own Save buttons.
    fireEvent.click(screen.getByRole('button', { name: 'Apply to 1 flag in Production' }));
    await waitFor(() => expect(patchCalls(stub)).toHaveLength(1));
    expect(patchCalls(stub)[0]!.body).toEqual({ rolloutPercent: 10, enabled: true });
  });
});

describe('role gating', () => {
  it('shows a viewer no checkboxes at all', async () => {
    renderPage(pageHandlers('viewer'));
    await waitForRows();
    // No selection on the ctx, so the column is not rendered - rather than
    // rendered and disabled, which would advertise actions a viewer cannot run.
    expect(inTable().queryAllByRole('checkbox')).toHaveLength(0);
    noBar();
  });
});

describe('the selection lifecycle', () => {
  it('drops the selection when the environment changes', async () => {
    localStorage.setItem('tf.environment', DEV_ENV_ID);
    stubAuth();
    stubFetch(pageHandlers());
    renderWithProviders(
      <>
        <EnvironmentSwitch />
        <FlagsPage />
      </>,
    );
    await waitForRows();
    fireEvent.click(rowBox('tool.summarize'));
    expect(bar().getByText('1 flag selected')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'go to prod' }));
    // A flag id is project-scoped, so the same ids are on screen in Production
    // and the tick would otherwise carry over into the environment where it
    // matters most.
    await waitFor(() => expect(screen.getByText(/in Production/)).toBeTruthy());
    noBar();
  });
});
