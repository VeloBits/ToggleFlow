// @vitest-environment happy-dom
/**
 * The flag detail screen: its four tabs, the kill switch (with the prod confirm
 * gate), the typed value editor, rollout, targeting-rule validation, the
 * read-only environment matrix, config save, and version history / diff /
 * rollback.
 *
 * ## Convention: a tab's contents are not in the DOM until it is open
 *
 * Radix unmounts an inactive `TabsContent`, so - unlike the flags list, where
 * both layouts always render - every assertion here has to be preceded by the
 * tab it belongs to. `renderPage(handlers, 'config')` deep-links straight there
 * (which is also the deep-link test), and `openTab()` switches.
 *
 * ## Convention: tabs open on mousedown
 *
 * Radix's tab trigger calls `onValueChange` from `onMouseDown`, not `onClick`, so
 * that the panel has changed before focus moves. `fireEvent.click` dispatches
 * neither a mousedown nor a focus, so a click-driven test would sit on the State
 * tab and silently assert nothing. `openTab` fires mousedown and then waits for
 * `data-state=active`.
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConfigVersion, FlagConfig, FlagDefinition, FlagState } from '../src/api/client';
import { FlagDetailPage } from '../src/features/flags';
import {
  DEV_ENV_ID,
  ENV_ID,
  flagDefinition,
  flagRow,
  renderWithProviders,
  stubAuth,
  stubFetch,
  workspaceHandlers,
  type FetchStub,
  type Handlers,
} from './harness';

const FLAG_ID = 't1';
const CONFIG_BASE = (envId = ENV_ID) => `/v1/environments/${envId}/tools/${FLAG_ID}/config`;
const FLAG_PATCH = (envId = ENV_ID) => `PATCH /v1/environments/${envId}/tools/${FLAG_ID}/flag`;

const flagDetail = (over: Partial<FlagDefinition> = {}, flagStates: FlagState[] = []) => ({
  ...flagDefinition({ id: FLAG_ID, description: 'Shortens text', ...over }),
  flagStates,
});

/** One environment's row inside `GET /v1/tools/:flagId`'s `flagStates`. */
const flagState = (over: Partial<FlagState> = {}): FlagState => ({
  environmentId: ENV_ID,
  environmentKey: 'prod',
  enabled: true,
  value: null,
  rolloutPercent: null,
  targetingRules: [],
  updatedAt: '2026-07-20T10:00:00.000Z',
  ...over,
});

const config = (over: Partial<FlagConfig> = {}): FlagConfig => ({
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
  [`GET /v1/tools/${FLAG_ID}`]: flagDetail(),
  [`GET /v1/environments/${envId}/flags`]: [flagRow({ id: FLAG_ID })],
  [`GET ${CONFIG_BASE(envId)}`]: config(),
  [`GET ${CONFIG_BASE(envId)}/versions`]: [version(3), version(2)],
  ...over,
});

/** Renders the active tab's search string, so deep-linking is assertable. */
function SearchProbe() {
  return <span>url{useLocation().search}</span>;
}

/**
 * Mounted under a real route: the page reads :flagId from useParams and
 * early-returns null without one, so rendering it bare shows nothing at all. The
 * bare `/flags` route is there so a click on the breadcrumb has somewhere to go.
 */
function renderPage(handlers: Handlers = pageHandlers(), tab?: string): { stub: FetchStub } {
  stubAuth();
  const stub = stubFetch(handlers);
  renderWithProviders(
    <>
      <SearchProbe />
      <Routes>
        <Route path="/flags/:flagId" element={<FlagDetailPage />} />
        <Route path="/flags" element={<FlagDetailPage />} />
      </Routes>
    </>,
    { route: tab === undefined ? `/flags/${FLAG_ID}` : `/flags/${FLAG_ID}?tab=${tab}` },
  );
  return { stub };
}

/**
 * The header is the one thing on every tab, and the copy button's label is the
 * only place the key appears exactly once - the Settings tab prints it again as a
 * definition fact.
 */
const loaded = () =>
  waitFor(() => expect(screen.getByLabelText('Copy key tool.summarize')).toBeTruthy());

/**
 * Positive gates per tab. Waiting for a loading string to DISAPPEAR would pass
 * instantly on the first render, before the flag query has even resolved - that
 * text is absent before the panel exists, not only after.
 */
const stateReady = () => waitFor(() => expect(screen.getByLabelText(/Rollout %/)).toBeTruthy());
/**
 * A non-empty draft, not merely a mounted textarea: the field exists from the
 * first paint of the tab, so gating on its presence would let every assertion
 * about `current.version` race the config request and read `(version 0)`.
 */
const configReady = () =>
  waitFor(() =>
    expect((screen.getByLabelText('Config value') as HTMLTextAreaElement).value).not.toBe(''),
  );
/** The version list is a second request, and the history panel waits on it. */
const historyReady = () => waitFor(() => expect(screen.getAllByText('diff').length).toBe(2));
/**
 * The environment names, the current-environment highlight and the header's
 * status badge all come from the workspace, which is three round trips deep -
 * the flag itself arrives first, so a bare row count is not enough.
 */
const workspaceReady = () =>
  waitFor(() => expect(screen.getAllByText('Production').length).toBeGreaterThan(0));

const tab = (name: string) => screen.getByRole('tab', { name });
const openTab = async (name: string) => {
  fireEvent.mouseDown(tab(name));
  await waitFor(() => expect(tab(name).getAttribute('data-state')).toBe('active'));
};

/** Matrix body rows, in the order `flagStates` arrived; index 0 is the header. */
const envRows = () => screen.getAllByRole('row').slice(1);

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('header', () => {
  it('renders the key, name, description, tags, type and environment', async () => {
    renderPage();
    await loaded();
    expect(screen.getByText('Summarize')).toBeTruthy();
    expect(screen.getByText('Shortens text')).toBeTruthy();
    expect(screen.getByText('text')).toBeTruthy();
    expect(screen.getByText('Boolean')).toBeTruthy();
    // The environment is named in the header, not only in the topbar: everything
    // on the State tab acts on it. The status badge waits on the same query, so
    // both are asserted once it has landed.
    await waitFor(() => {
      expect(screen.getByText('Production')).toBeTruthy();
      expect(screen.getAllByText('ON')).toHaveLength(2);
    });
  });

  it('renders no description line when the flag has none', async () => {
    // Was "omits the em dash": name and description used to be one sentence
    // joined by " - ". They are now separate elements, so the assertion is that
    // the second one is absent rather than that a separator is.
    renderPage(
      pageHandlers('admin', { [`GET /v1/tools/${FLAG_ID}`]: flagDetail({ description: null }) }),
    );
    await loaded();
    expect(screen.queryByText('Shortens text')).toBeNull();
  });

  it('shows a loading skeleton, then the flag', async () => {
    renderPage();
    expect(screen.getByLabelText('Loading flag')).toBeTruthy();
    await loaded();
    expect(screen.queryByLabelText('Loading flag')).toBeNull();
  });

  it('renders the error instead of the page when the flag fails to load', async () => {
    renderPage(
      pageHandlers('admin', {
        [`GET /v1/tools/${FLAG_ID}`]: {
          status: 404,
          body: { error: 'not_found', message: 'tool not found' },
        },
      }),
    );
    await waitFor(() => expect(screen.getByText('tool not found')).toBeTruthy());
    // Not even the tab strip: there is nothing to show tabs of.
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('copies the key and says so', async () => {
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    renderPage();
    await loaded();

    fireEvent.click(screen.getByLabelText('Copy key tool.summarize'));
    expect(writeText).toHaveBeenCalledWith('tool.summarize');
    await waitFor(() => expect(screen.getByText('Copied tool.summarize')).toBeTruthy());
  });

  it('renders nothing when the route carries no flag id', async () => {
    renderPage();
    await loaded();
    fireEvent.click(screen.getByText('Flags'));
    await waitFor(() => expect(screen.queryByLabelText('Copy key tool.summarize')).toBeNull());
  });
});

describe('archive', () => {
  it('archives after a confirm, refetches and names the flag', async () => {
    const { stub } = renderPage(
      pageHandlers('admin', { [`PATCH /v1/tools/${FLAG_ID}`]: { ok: true } }),
    );
    await loaded();

    fireEvent.click(screen.getByText('Archive'));
    fireEvent.click(screen.getByText('Archive (drops from snapshots)?'));

    await waitFor(() =>
      expect(stub.calls.find((c) => c.key === `PATCH /v1/tools/${FLAG_ID}`)?.body).toEqual({
        archived: true,
      }),
    );
    await waitFor(() => expect(screen.getByText('tool.summarize archived')).toBeTruthy());
  });

  it('offers Restore for an archived flag and marks it', async () => {
    // Was `getByText('archived')` against a loose tag beside the status chip.
    // `FlagStatusBadge` now owns the archived state, and it renders ARCHIVED.
    const { stub } = renderPage(
      pageHandlers('admin', {
        [`GET /v1/tools/${FLAG_ID}`]: flagDetail({ archived: true }),
        [`PATCH /v1/tools/${FLAG_ID}`]: { ok: true },
      }),
    );
    await loaded();
    // Twice: the header badge and the state panel's own.
    await waitFor(() => expect(screen.getAllByText('ARCHIVED')).toHaveLength(2));

    fireEvent.click(screen.getByText('Restore'));
    fireEvent.click(screen.getByText('Restore?'));
    await waitFor(() =>
      expect(stub.calls.find((c) => c.key === `PATCH /v1/tools/${FLAG_ID}`)?.body).toEqual({
        archived: false,
      }),
    );
  });

  it('hides archive from a viewer', async () => {
    renderPage(pageHandlers('viewer'));
    await loaded();
    expect(screen.queryByText('Archive')).toBeNull();
  });

  it('surfaces a rejected archive', async () => {
    renderPage(
      pageHandlers('admin', {
        [`PATCH /v1/tools/${FLAG_ID}`]: {
          status: 403,
          body: { error: 'forbidden', message: 'admins only' },
        },
      }),
    );
    await loaded();
    fireEvent.click(screen.getByText('Archive'));
    fireEvent.click(screen.getByText('Archive (drops from snapshots)?'));
    await waitFor(() => expect(screen.getByText('admins only')).toBeTruthy());
  });
});

describe('tabs', () => {
  it('deep-links to the config tab', async () => {
    renderPage(pageHandlers(), 'config');
    await configReady();
    expect(tab('Config').getAttribute('data-state')).toBe('active');
    // The State tab's controls are not merely hidden - Radix unmounts them.
    expect(screen.queryByLabelText(/Rollout %/)).toBeNull();
  });

  it('falls back to State for a tab name it does not know', async () => {
    renderPage(pageHandlers(), 'nonsense');
    await stateReady();
    expect(tab('State').getAttribute('data-state')).toBe('active');
  });

  it('puts the chosen tab in the URL so the page can be shared', async () => {
    renderPage();
    await stateReady();
    expect(screen.getByText('url')).toBeTruthy();

    await openTab('Config');
    await configReady();
    expect(screen.getByText('url?tab=config')).toBeTruthy();

    await openTab('State');
    await stateReady();
    expect(screen.getByText('url?tab=state')).toBeTruthy();
  });
});

describe('state tab', () => {
  it('shows the current state and flips the kill switch without confirming in dev', async () => {
    // Production is the default selection, so the non-prod path has to ask for
    // the dev environment explicitly.
    localStorage.setItem('tf.environment', DEV_ENV_ID);
    const { stub } = renderPage(
      pageHandlers('admin', { [FLAG_PATCH(DEV_ENV_ID)]: { ok: true } }, DEV_ENV_ID),
    );
    await stateReady();
    expect(screen.getByText('State in Development')).toBeTruthy();
    // A boolean flag gets no separate value editor - the switch IS the value.
    expect(screen.getByText(/A boolean flag serves this switch/)).toBeTruthy();
    expect(screen.queryByLabelText('Value served while on')).toBeNull();

    // requireConfirm is false outside prod, so one click is enough.
    fireEvent.click(screen.getByText('Turn OFF (kill switch)'));
    await waitFor(() =>
      expect(stub.calls.find((c) => c.key === FLAG_PATCH(DEV_ENV_ID))?.body).toEqual({
        enabled: false,
      }),
    );
  });

  it('requires a second click in prod', async () => {
    const { stub } = renderPage(pageHandlers('admin', { [FLAG_PATCH()]: { ok: true } }));
    await stateReady();
    expect(screen.getByText('production changes ask for confirmation')).toBeTruthy();

    fireEvent.click(screen.getByText('Turn OFF (kill switch)'));
    expect(stub.calls.some((c) => c.key.startsWith('PATCH'))).toBe(false);

    fireEvent.click(screen.getByText('Confirm OFF in prod?'));
    await waitFor(() => expect(stub.calls.some((c) => c.key.startsWith('PATCH'))).toBe(true));
  });

  it('offers Turn ON for a disabled flag', async () => {
    renderPage(
      pageHandlers('admin', {
        [`GET /v1/environments/${ENV_ID}/flags`]: [flagRow({ enabled: false })],
      }),
    );
    await stateReady();
    expect(screen.getByText('Turn ON')).toBeTruthy();
    expect(screen.getAllByText('OFF')).toHaveLength(2);
  });

  it('pre-fills the rollout and saves it as a number', async () => {
    const { stub } = renderPage(
      pageHandlers('admin', {
        [`GET /v1/environments/${ENV_ID}/flags`]: [flagRow({ rolloutPercent: 25 })],
        [FLAG_PATCH()]: { ok: true },
      }),
    );
    await stateReady();
    expect(screen.getByLabelText(/Rollout %/)).toHaveProperty('value', '25');

    fireEvent.change(screen.getByLabelText(/Rollout %/), { target: { value: '60' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() =>
      expect(stub.calls.find((c) => c.key.endsWith('/flag'))?.body).toEqual({ rolloutPercent: 60 }),
    );
  });

  it('sends null when the rollout is cleared - empty means everyone', async () => {
    const { stub } = renderPage(
      pageHandlers('admin', {
        [`GET /v1/environments/${ENV_ID}/flags`]: [flagRow({ rolloutPercent: 25 })],
        [FLAG_PATCH()]: { ok: true },
      }),
    );
    await stateReady();

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
    await stateReady();

    fireEvent.change(screen.getByLabelText('Targeting rules'), { target: { value: '{oops' } });
    fireEvent.click(screen.getByText('Save targeting + rollout'));

    expect(screen.getByText('Not valid JSON.')).toBeTruthy();
    expect(stub.calls.some((c) => c.key.startsWith('PATCH'))).toBe(false);
  });

  it('reports schema violations with a field path', async () => {
    const { stub } = renderPage();
    await stateReady();

    // Valid JSON, but `enabled` is required on a targeting rule.
    fireEvent.change(screen.getByLabelText('Targeting rules'), {
      target: { value: '[{"segments":["beta"]}]' },
    });
    fireEvent.click(screen.getByText('Save targeting + rollout'));

    await waitFor(() => expect(screen.getByText(/0\.enabled/)).toBeTruthy());
    expect(stub.calls.some((c) => c.key.startsWith('PATCH'))).toBe(false);
  });

  it('saves valid targeting rules together with the rollout', async () => {
    const { stub } = renderPage(pageHandlers('admin', { [FLAG_PATCH()]: { ok: true } }));
    await stateReady();

    fireEvent.change(screen.getByLabelText('Targeting rules'), {
      target: { value: '[{"segments":["beta"],"enabled":true}]' },
    });
    fireEvent.click(screen.getByText('Save targeting + rollout'));

    await waitFor(() => expect(stub.calls.some((c) => c.key.endsWith('/flag'))).toBe(true));
    expect(stub.calls.find((c) => c.key.endsWith('/flag'))?.body).toEqual({
      targetingRules: [{ segments: ['beta'], conditions: [], enabled: true }],
      rolloutPercent: null,
    });
  });

  it('accepts a rule that serves its own value', async () => {
    // targetingRuleSchema.value is optional and additive, and the field's hint
    // says so - a rule may override the flag's value for the users it matches.
    const { stub } = renderPage(pageHandlers('admin', { [FLAG_PATCH()]: { ok: true } }));
    await stateReady();
    expect(screen.getByText(/A rule may also serve its own value/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Targeting rules'), {
      target: { value: '[{"segments":["beta"],"enabled":true,"value":"beta copy"}]' },
    });
    fireEvent.click(screen.getByText('Save targeting + rollout'));

    await waitFor(() =>
      expect(stub.calls.find((c) => c.key.endsWith('/flag'))?.body).toEqual({
        targetingRules: [{ segments: ['beta'], conditions: [], enabled: true, value: 'beta copy' }],
        rolloutPercent: null,
      }),
    );
  });

  it('surfaces a rejected flag patch', async () => {
    // In dev, so a single click reaches the API - the prod double-click is a
    // separate concern with its own test above. The message arrives as a toast
    // now: useFlagPatch rolls the optimistic write back and reports it there.
    localStorage.setItem('tf.environment', DEV_ENV_ID);
    renderPage(
      pageHandlers(
        'admin',
        {
          [FLAG_PATCH(DEV_ENV_ID)]: {
            status: 403,
            body: { error: 'forbidden', message: 'role too low' },
          },
        },
        DEV_ENV_ID,
      ),
    );
    await stateReady();

    fireEvent.click(screen.getByText('Turn OFF (kill switch)'));
    await waitFor(() => expect(screen.getByText('role too low')).toBeTruthy());
  });

  it('is read-only for a viewer', async () => {
    renderPage(pageHandlers('viewer'));
    await stateReady();
    expect(screen.getByLabelText(/Rollout %/)).toHaveProperty('disabled', true);
    expect(screen.getByLabelText('Targeting rules')).toHaveProperty('disabled', true);
    expect(screen.queryByText('Save targeting + rollout')).toBeNull();
    expect(screen.queryByText('Turn OFF (kill switch)')).toBeNull();
  });

  it('is read-only for an archived flag even as admin, and says why', async () => {
    renderPage(
      pageHandlers('admin', { [`GET /v1/tools/${FLAG_ID}`]: flagDetail({ archived: true }) }),
    );
    await stateReady();
    // canEdit is `canEdit && !flag.archived` for the state tab only.
    expect(screen.queryByText('Turn OFF (kill switch)')).toBeNull();
    expect(screen.getByText('This flag is archived')).toBeTruthy();

    // The config is still editable: nothing is being served, but preparing the
    // payload of a flag you intend to restore is legitimate.
    await openTab('Config');
    await configReady();
    expect(screen.getByText(/Save as version/)).toBeTruthy();
  });

  it('explains an environment the flag has no state in', async () => {
    // Was "keeps showing the loading panel": a resolved list with no matching row
    // is not loading, it is an environment this flag was never registered in, and
    // the pending case now has its own skeleton.
    renderPage(pageHandlers('admin', { [`GET /v1/environments/${ENV_ID}/flags`]: [] }));
    await loaded();
    await waitFor(() =>
      expect(screen.getByText(/This flag has no state in Production/)).toBeTruthy(),
    );
    expect(screen.queryByLabelText(/Rollout %/)).toBeNull();
  });
});

describe('state tab: typed flags', () => {
  const stringHandlers = (over: Handlers = {}, rowOver: Record<string, unknown> = {}) =>
    pageHandlers('admin', {
      [`GET /v1/tools/${FLAG_ID}`]: flagDetail({
        valueType: 'string',
        defaultValue: 'default copy',
      }),
      [`GET /v1/environments/${ENV_ID}/flags`]: [
        flagRow({ id: FLAG_ID, valueType: 'string', value: 'live copy', ...rowOver }),
      ],
      ...over,
    });

  it('edits the served value alongside the switch, and saves only the value', async () => {
    const { stub } = renderPage(stringHandlers({ [FLAG_PATCH()]: { ok: true } }));
    await stateReady();

    const field = screen.getByLabelText('Value served while on');
    expect(field).toHaveProperty('value', 'live copy');
    // Both controls, because they answer different questions: whether the flag
    // serves at all, and what it serves.
    expect(screen.getByText('Turn OFF (kill switch)')).toBeTruthy();
    expect(screen.getByText(/While off it serves config.fallback/)).toBeTruthy();

    fireEvent.change(field, { target: { value: 'new copy' } });
    fireEvent.click(screen.getByText('Save value'));
    await waitFor(() =>
      expect(stub.calls.find((c) => c.key.endsWith('/flag'))?.body).toEqual({ value: 'new copy' }),
    );
  });

  it('falls back to the definition default when the environment has no value', async () => {
    renderPage(stringHandlers({}, { value: null }));
    await stateReady();
    expect(screen.getByLabelText('Value served while on')).toHaveProperty('value', 'default copy');
  });

  it('offers the enum members for a choice flag', async () => {
    const { stub } = renderPage(
      pageHandlers('admin', {
        [`GET /v1/tools/${FLAG_ID}`]: flagDetail({
          valueType: 'string_enum',
          enumOptions: ['fast', 'balanced', 'quality'],
        }),
        [`GET /v1/environments/${ENV_ID}/flags`]: [
          flagRow({
            id: FLAG_ID,
            valueType: 'string_enum',
            enumOptions: ['fast', 'balanced', 'quality'],
            value: 'balanced',
          }),
        ],
        [FLAG_PATCH()]: { ok: true },
      }),
    );
    await stateReady();

    const field = screen.getByLabelText('Value served while on');
    expect(field).toHaveProperty('value', 'balanced');
    fireEvent.change(field, { target: { value: 'quality' } });
    fireEvent.click(screen.getByText('Save value'));
    await waitFor(() =>
      expect(stub.calls.find((c) => c.key.endsWith('/flag'))?.body).toEqual({ value: 'quality' }),
    );
  });
});

describe('environments tab', () => {
  const STATES: FlagState[] = [
    flagState(),
    flagState({
      environmentId: DEV_ENV_ID,
      environmentKey: 'dev',
      enabled: false,
      rolloutPercent: 25,
      targetingRules: [{ segments: ['beta'], conditions: [], enabled: true }],
    }),
    // An environment the workspace's own list has not caught up with. The matrix
    // has to render it from the key the flag itself carries.
    flagState({ environmentId: 'env-unknown', environmentKey: 'staging' }),
  ];

  const matrixHandlers = (over: Handlers = {}, states = STATES) =>
    pageHandlers('admin', {
      [`GET /v1/tools/${FLAG_ID}`]: flagDetail({}, states),
      ...over,
    });

  it('lists every environment with its status, rollout, rules and timestamp', async () => {
    renderPage(matrixHandlers(), 'environments');
    await workspaceReady();
    expect(envRows()).toHaveLength(3);

    const [prod, dev, staging] = envRows();
    expect(within(prod!).getByText('Production')).toBeTruthy();
    expect(within(prod!).getByText('ON')).toBeTruthy();
    // A boolean flag's served value IS its switch.
    expect(within(prod!).getByText('true')).toBeTruthy();
    // No rollout and no rules read as absent, not as zero.
    expect(within(prod!).getAllByText('—')).toHaveLength(2);

    expect(within(dev!).getByText('Development')).toBeTruthy();
    expect(within(dev!).getByText('25%')).toBeTruthy();
    expect(within(dev!).getByText('false')).toBeTruthy();
    expect(within(dev!).getByText('1')).toBeTruthy();

    // Name unknown to the workspace, so the flag's own key stands in for it.
    expect(within(staging!).getAllByText('staging').length).toBeGreaterThan(0);
  });

  it('shows what each environment serves when on for a typed flag', async () => {
    renderPage(
      matrixHandlers(
        {
          [`GET /v1/tools/${FLAG_ID}`]: flagDetail(
            { valueType: 'string', defaultValue: 'default copy' },
            [
              flagState({ value: 'prod copy' }),
              flagState({ environmentId: DEV_ENV_ID, environmentKey: 'dev', value: null }),
            ],
          ),
        },
        STATES,
      ),
      'environments',
    );
    await workspaceReady();
    expect(envRows()).toHaveLength(2);

    const [prod, dev] = envRows();
    expect(within(prod!).getByText('prod copy')).toBeTruthy();
    // No value of its own, so it inherits the definition's default.
    expect(within(dev!).getByText('default copy')).toBeTruthy();
  });

  it('marks the environment being edited and offers no switch for it', async () => {
    renderPage(matrixHandlers(), 'environments');
    await workspaceReady();

    const [prod, dev] = envRows();
    expect(prod!.getAttribute('aria-current')).toBe('true');
    expect(within(prod!).getByText('Editing this environment')).toBeTruthy();
    expect(dev!.getAttribute('aria-current')).toBeNull();
  });

  it('is read-only: every other environment offers exactly one action', async () => {
    // Editing an environment from a screen headed with a different one is the
    // mistake this product exists to prevent, so the matrix has no controls at
    // all beyond "stand here instead".
    renderPage(matrixHandlers(), 'environments');
    await workspaceReady();

    const dev = envRows()[1]!;
    expect(within(dev).queryByRole('switch')).toBeNull();
    expect(within(dev).queryByRole('textbox')).toBeNull();
    expect(within(dev).queryByRole('combobox')).toBeNull();
    expect(within(dev).getAllByRole('button')).toHaveLength(1);
    expect(within(dev).getByText('Switch to this environment')).toBeTruthy();
  });

  it('switching an environment moves the whole workspace to it', async () => {
    renderPage(
      matrixHandlers({
        [`GET /v1/environments/${DEV_ENV_ID}/flags`]: [flagRow({ id: FLAG_ID })],
        [`GET ${CONFIG_BASE(DEV_ENV_ID)}`]: config(),
        [`GET ${CONFIG_BASE(DEV_ENV_ID)}/versions`]: [],
      }),
      'environments',
    );
    await workspaceReady();

    fireEvent.click(within(envRows()[1]!).getByText('Switch to this environment'));
    await waitFor(() => expect(localStorage.getItem('tf.environment')).toBe(DEV_ENV_ID));

    // And the State tab now edits that one, which is the whole point of the trip.
    await openTab('State');
    await waitFor(() => expect(screen.getByText('State in Development')).toBeTruthy());
  });

  it('says so when the flag has no environment rows at all', async () => {
    renderPage(pageHandlers(), 'environments');
    await waitFor(() =>
      expect(screen.getByText('This flag has no environment state yet')).toBeTruthy(),
    );
  });
});

describe('config tab', () => {
  it('shows the current version and pre-fills the draft', async () => {
    renderPage(pageHandlers(), 'config');
    await configReady();
    expect(screen.getByText('(version 3)')).toBeTruthy();
    expect(screen.getByLabelText('Config value')).toHaveProperty(
      'value',
      JSON.stringify({ limit: 5, mode: 'fast' }, null, 2),
    );
    // The copy that matters more now than it did: for a typed flag this field is
    // the off-state served value, not decoration.
    expect(screen.getByText(/what users get while the flag is/)).toBeTruthy();
  });

  it('offers a fallback skeleton when no config exists yet', async () => {
    renderPage(
      pageHandlers('admin', {
        [`GET ${CONFIG_BASE()}`]: config({ value: null, version: 0 }),
        [`GET ${CONFIG_BASE()}/versions`]: [],
      }),
      'config',
    );
    await configReady();
    expect(screen.getByLabelText('Config value')).toHaveProperty(
      'value',
      JSON.stringify({ fallback: { mode: 'message', message: '' } }, null, 2),
    );
    // No history panel when there are no versions.
    expect(screen.queryByText('History')).toBeNull();
  });

  it('saves the draft as the next version', async () => {
    const { stub } = renderPage(
      pageHandlers('admin', { [`PUT ${CONFIG_BASE()}`]: { version: 4 } }),
      'config',
    );
    await configReady();

    expect(screen.getByText('Save as version 4')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Config value'), { target: { value: '{"limit":9}' } });
    fireEvent.click(screen.getByText('Save as version 4'));

    await waitFor(() =>
      expect(stub.calls.find((c) => c.key === `PUT ${CONFIG_BASE()}`)?.body).toEqual({
        value: { limit: 9 },
      }),
    );
  });

  it('rejects invalid JSON in the config draft', async () => {
    const { stub } = renderPage(pageHandlers(), 'config');
    await configReady();

    fireEvent.change(screen.getByLabelText('Config value'), { target: { value: '{' } });
    fireEvent.click(screen.getByText('Save as version 4'));
    expect(screen.getByText('Not valid JSON.')).toBeTruthy();
    expect(stub.calls.some((c) => c.key.startsWith('PUT'))).toBe(false);
  });

  it('rejects a non-object config', async () => {
    const { stub } = renderPage(pageHandlers(), 'config');
    await configReady();

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
      'config',
    );
    await configReady();

    fireEvent.click(screen.getByText('Save as version 4'));
    await waitFor(() => expect(screen.getByText('nope')).toBeTruthy());
  });

  it('hides the save button from a viewer', async () => {
    renderPage(pageHandlers('viewer'), 'config');
    await configReady();
    expect(screen.queryByText(/Save as version/)).toBeNull();
  });
});

describe('config history', () => {
  it('lists versions and notes a restore', async () => {
    renderPage(
      pageHandlers('admin', {
        [`GET ${CONFIG_BASE()}/versions`]: [version(3, { restoredFromVersion: 1 }), version(2)],
      }),
      'config',
    );
    await historyReady();

    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.getByText('v3')).toBeTruthy();
    expect(screen.getByText('restored from v1')).toBeTruthy();
  });

  it('toggles a diff open and closed', async () => {
    renderPage(pageHandlers(), 'config');
    await historyReady();

    const [diffButton] = screen.getAllByText('diff');
    fireEvent.click(diffButton!);
    expect(screen.getByText(/removed lines are v3/)).toBeTruthy();
    // The added/removed lines come from the LCS diff of the two payloads.
    expect(document.querySelector('.diff .removed')).toBeTruthy();

    fireEvent.click(screen.getByText('hide diff'));
    expect(screen.queryByText(/removed lines are v/)).toBeNull();
  });

  it('offers restore only for versions that are not current', async () => {
    renderPage(pageHandlers(), 'config');
    await historyReady();
    // v3 is current, v2 is not - so exactly one restore button.
    expect(screen.getAllByText('restore')).toHaveLength(1);
  });

  it('rolls back to a chosen version after confirming', async () => {
    const { stub } = renderPage(
      pageHandlers('admin', { [`POST ${CONFIG_BASE()}/rollback`]: { version: 4 } }),
      'config',
    );
    await historyReady();

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
      'config',
    );
    await historyReady();

    fireEvent.click(screen.getByText('restore'));
    fireEvent.click(screen.getByText('Restore this version?'));
    await waitFor(() => expect(screen.getByText('version moved on')).toBeTruthy());
  });

  it('hides restore from a viewer but keeps the diff', async () => {
    renderPage(pageHandlers('viewer'), 'config');
    await historyReady();
    expect(screen.queryByText('restore')).toBeNull();
    expect(screen.getAllByText('diff').length).toBeGreaterThan(0);
  });
});

describe('settings tab', () => {
  it('shows the definition, which is project-wide rather than per environment', async () => {
    renderPage(pageHandlers(), 'settings');
    await waitFor(() => expect(screen.getByText('Edit definition')).toBeTruthy());

    // Scoped to the fact list: the type also appears as a badge in the header,
    // and the key as the breadcrumb leaf.
    const facts = within(screen.getByText('Key').closest('dl')!);
    expect(facts.getByText('tool.summarize')).toBeTruthy();
    expect(facts.getByText('Boolean')).toBeTruthy();
    // A boolean flag has no options, and `false` is its formatted default.
    expect(facts.getByText('false')).toBeTruthy();
    expect(facts.getByText('—')).toBeTruthy();
    expect(facts.getByText('Last changed')).toBeTruthy();
  });

  it('lists the members of a choice flag', async () => {
    renderPage(
      pageHandlers('admin', {
        [`GET /v1/tools/${FLAG_ID}`]: flagDetail({
          valueType: 'string_enum',
          enumOptions: ['fast', 'balanced'],
        }),
      }),
      'settings',
    );
    await waitFor(() => expect(screen.getByText('fast, balanced')).toBeTruthy());
  });

  it('opens the edit dialog and closes it again', async () => {
    renderPage(pageHandlers(), 'settings');
    await waitFor(() => expect(screen.getByText('Edit definition')).toBeTruthy());

    fireEvent.click(screen.getByText('Edit definition'));
    await waitFor(() => expect(screen.getByText('Edit tool.summarize')).toBeTruthy());
    // The key cannot be renamed - every deployed SDK call site passes it.
    expect(screen.getByLabelText('Key')).toHaveProperty('disabled', true);

    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => expect(screen.queryByText('Edit tool.summarize')).toBeNull());
  });

  it('archives from here too, with its own explained confirm', async () => {
    const { stub } = renderPage(
      pageHandlers('admin', { [`PATCH /v1/tools/${FLAG_ID}`]: { ok: true } }),
      'settings',
    );
    await waitFor(() => expect(screen.getByText('Archive this flag')).toBeTruthy());

    fireEvent.click(screen.getByText('Archive this flag'));
    fireEvent.click(screen.getByText('Yes, archive it'));
    await waitFor(() =>
      expect(stub.calls.find((c) => c.key === `PATCH /v1/tools/${FLAG_ID}`)?.body).toEqual({
        archived: true,
      }),
    );
  });

  it('offers restore instead once the flag is archived', async () => {
    const { stub } = renderPage(
      pageHandlers('admin', {
        [`GET /v1/tools/${FLAG_ID}`]: flagDetail({ archived: true }),
        [`PATCH /v1/tools/${FLAG_ID}`]: { ok: true },
      }),
      'settings',
    );
    await waitFor(() => expect(screen.getByText('Restore this flag')).toBeTruthy());

    fireEvent.click(screen.getByText('Restore this flag'));
    fireEvent.click(screen.getByText('Yes, restore it'));
    await waitFor(() =>
      expect(stub.calls.find((c) => c.key === `PATCH /v1/tools/${FLAG_ID}`)?.body).toEqual({
        archived: false,
      }),
    );
  });

  it('offers a viewer neither edit nor archive', async () => {
    renderPage(pageHandlers('viewer'), 'settings');
    await waitFor(() => expect(screen.getByText('Definition')).toBeTruthy());
    expect(screen.queryByText('Edit definition')).toBeNull();
    expect(screen.queryByText('Archive this flag')).toBeNull();
  });
});
