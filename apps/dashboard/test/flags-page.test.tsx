// @vitest-environment happy-dom
/**
 * The flags list: rendering, the four filters, sorting, inline value editing
 * with its optimistic update, role gating, paging and the two empty states.
 *
 * ## Convention: always scope a list assertion to one layout
 *
 * The page renders the table AND the cards on every paint and lets CSS choose at
 * `md` (see FlagsTable's docblock for why that beats a `matchMedia` hook). So
 * every row is in the DOM twice, and a bare `getByText('tool.ocr')` throws
 * "found multiple elements". Scope with `inTable()` or `inCards()` below.
 *
 * ## Convention: ENV_ID is production
 *
 * The harness' default environment has key `prod`, so value changes arm before
 * they fire. `renderPage` therefore selects the *dev* environment, and the
 * production test opts back in explicitly - otherwise every toggle assertion
 * would silently be exercising the confirm path instead of the happy one.
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlagDefinition } from '../src/api/client';
import { FlagsPage } from '../src/features/flags';
import {
  DEV_ENV_ID,
  dynamic,
  ENV_ID,
  PROJECT_ID,
  flagDefinition,
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
    valueType: 'string',
    value: 'Deploys are faster',
  }),
  flagRow({
    id: 't6',
    key: 'tool.model',
    name: 'Model choice',
    valueType: 'string_enum',
    enumOptions: ['fast', 'balanced', 'quality'],
    value: 'balanced',
  }),
];

const DEFINITIONS: FlagDefinition[] = [
  flagDefinition({ id: 't1', key: 'tool.summarize', name: 'Summarize', tags: ['text'] }),
  flagDefinition({ id: 't2', key: 'tool.translate', name: 'Translate', tags: ['text', 'i18n'] }),
  flagDefinition({ id: 't3', key: 'tool.rewrite', name: 'Rewrite', tags: [] }),
  flagDefinition({ id: 't4', key: 'tool.legacy', name: 'Legacy', tags: [], archived: true }),
  flagDefinition({
    id: 't5',
    key: 'tool.banner',
    name: 'Banner copy',
    description: 'Text shown in the top banner',
    tags: [],
    valueType: 'string',
  }),
  flagDefinition({
    id: 't6',
    key: 'tool.model',
    name: 'Model choice',
    tags: [],
    valueType: 'string_enum',
    enumOptions: ['fast', 'balanced', 'quality'],
  }),
];

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
  [`GET /v1/projects/${PROJECT_ID}/tools`]: DEFINITIONS,
  ...over,
});

/** Renders against the DEV environment, so value changes commit on one gesture. */
function renderPage(handlers: Handlers = pageHandlers()): { stub: FetchStub } {
  localStorage.setItem('tf.environment', DEV_ENV_ID);
  stubAuth();
  const stub = stubFetch(handlers);
  renderWithProviders(<FlagsPage />);
  return { stub };
}

/** Renders against PRODUCTION, where a value change has to be confirmed. */
function renderProdPage(handlers: Handlers = pageHandlers()): { stub: FetchStub } {
  stubAuth();
  const stub = stubFetch(handlers);
  renderWithProviders(<FlagsPage />);
  return { stub };
}

const inTable = () => within(screen.getByRole('table', { name: 'Flags' }));
const inCards = () => within(screen.getByRole('list', { name: 'Flags (compact)' }));

/** Flag keys in table order - the copy button's label carries the key. */
const tableKeys = () =>
  inTable()
    .queryAllByRole('button', { name: /^Copy key / })
    .map((button) => button.getAttribute('aria-label')!.replace('Copy key ', ''));

const waitForRows = () => waitFor(() => expect(tableKeys().length).toBeGreaterThan(0));

const openFilters = async () => {
  fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
  await waitFor(() => expect(screen.getByLabelText('Status')).toBeTruthy());
};

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('listing', () => {
  it('shows a skeleton before the rows arrive, then the rows', async () => {
    renderPage();
    // The shape is known before the data is, so the table's outline is shown
    // rather than a spinner - see FlagsSkeleton.
    expect(screen.getByRole('status').textContent).toContain('Loading flags');
    await waitForRows();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('hides archived flags by default and reports the visible count', async () => {
    renderPage();
    await waitForRows();
    expect(tableKeys()).toHaveLength(5);
    expect(tableKeys()).not.toContain('tool.legacy');
    expect(screen.getByText('5 of 6 in Development')).toBeTruthy();
  });

  it('renders every row in both the table and the card list', async () => {
    renderPage();
    await waitForRows();
    // Both layouts always mount; CSS picks one. If this ever fails, the
    // responsive story has quietly become JS-driven.
    expect(inCards().queryAllByRole('button', { name: /^Copy key / })).toHaveLength(5);
  });

  it('shows each status as its own badge, with a rollout showing its percentage', async () => {
    renderPage();
    await waitForRows();
    const table = inTable();
    expect(table.getAllByText('ON').length).toBeGreaterThan(0);
    expect(table.getByText('OFF')).toBeTruthy();
    // "25%" beats the word "ROLLOUT": same space, strictly more information.
    expect(table.getByText('25%')).toBeTruthy();
  });

  it('labels each flag with its value type', async () => {
    renderPage();
    await waitForRows();
    const table = inTable();
    expect(table.getAllByText('Boolean')).toHaveLength(3);
    expect(table.getByText('String')).toBeTruthy();
    expect(table.getByText('String (choice)')).toBeTruthy();
  });

  it('joins tags and descriptions from the definitions query onto the rows', async () => {
    renderPage();
    await waitForRows();
    const table = inTable();
    expect(table.getByText('i18n')).toBeTruthy();
    expect(table.getByText('Text shown in the top banner')).toBeTruthy();
  });
});

describe('current value', () => {
  it('renders a boolean flag as a switch reflecting `enabled`', async () => {
    renderPage();
    await waitForRows();
    expect(inTable().getByLabelText('Toggle tool.summarize').getAttribute('data-state')).toBe(
      'checked',
    );
    expect(inTable().getByLabelText('Toggle tool.translate').getAttribute('data-state')).toBe(
      'unchecked',
    );
  });

  it('renders a string flag value as editable text', async () => {
    renderPage();
    await waitForRows();
    expect(inTable().getByLabelText('Edit value of tool.banner').textContent).toBe(
      'Deploys are faster',
    );
  });

  it('renders a string_enum flag as a select over its options', async () => {
    renderPage();
    await waitForRows();
    const select = inTable().getByLabelText('Value of tool.model') as HTMLSelectElement;
    expect(select.value).toBe('balanced');
    expect([...select.options].map((option) => option.value)).toEqual([
      'fast',
      'balanced',
      'quality',
    ]);
  });

  it('shows an off string flag serving its fallback, not its own value', async () => {
    renderPage(
      pageHandlers('admin', {
        ...flagsFor(DEV_ENV_ID, [
          flagRow({
            id: 't5',
            key: 'tool.banner',
            name: 'Banner copy',
            valueType: 'string',
            value: 'never seen while off',
            enabled: false,
          }),
        ]),
      }),
    );
    await waitForRows();
    // The configured value stays visible (struck through) because it is what
    // turning the flag on would serve; the arrow says a fallback is in play.
    expect(inTable().getByLabelText('Edit value of tool.banner').textContent).toBe(
      'never seen while off',
    );
    expect(inTable().getByText('→ fallback')).toBeTruthy();
  });
});

describe('filters', () => {
  it('searches key, name and description case-insensitively', async () => {
    renderPage();
    await waitForRows();
    fireEvent.change(screen.getByLabelText('Search flags'), { target: { value: 'TRANS' } });
    await waitFor(() => expect(tableKeys()).toEqual(['tool.translate']));

    fireEvent.change(screen.getByLabelText('Search flags'), { target: { value: 'top banner' } });
    await waitFor(() => expect(tableKeys()).toEqual(['tool.banner']));
  });

  it('filters by status', async () => {
    renderPage();
    await waitForRows();
    await openFilters();

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'off' } });
    await waitFor(() => expect(tableKeys()).toEqual(['tool.translate']));

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'rollout' } });
    await waitFor(() => expect(tableKeys()).toEqual(['tool.rewrite']));

    // `on` excludes the % rollout: "enabled" alone would hide the difference
    // between live for everyone and live for a quarter.
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'on' } });
    await waitFor(() => expect(tableKeys()).not.toContain('tool.rewrite'));
  });

  it('filters by value type', async () => {
    renderPage();
    await waitForRows();
    await openFilters();
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'string_enum' } });
    await waitFor(() => expect(tableKeys()).toEqual(['tool.model']));
  });

  it('filters by tag, offering only tags that exist', async () => {
    renderPage();
    await waitForRows();
    await openFilters();
    const tagSelect = screen.getByLabelText('Tag') as HTMLSelectElement;
    expect([...tagSelect.options].map((option) => option.value)).toEqual(['', 'i18n', 'text']);
    fireEvent.change(tagSelect, { target: { value: 'i18n' } });
    await waitFor(() => expect(tableKeys()).toEqual(['tool.translate']));
  });

  it('includes archived flags when asked, and counts the active filters', async () => {
    renderPage();
    await waitForRows();
    await openFilters();
    fireEvent.click(screen.getByLabelText('Show archived flags'));
    await waitFor(() => expect(tableKeys()).toContain('tool.legacy'));
    expect(screen.getByRole('button', { name: /Filters/ }).textContent).toContain('1');
  });

  it('distinguishes no-match from no-data, and clears back', async () => {
    renderPage();
    await waitForRows();
    fireEvent.change(screen.getByLabelText('Search flags'), { target: { value: 'zzz' } });
    await waitFor(() => expect(screen.getByText('Nothing matches these filters')).toBeTruthy());
    expect(screen.getByText(/6 flags in this environment/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Clear filters/ }));
    await waitForRows();
  });

  it('says the project is empty when there are no flags at all', async () => {
    renderPage(pageHandlers('admin', { ...flagsFor(DEV_ENV_ID, []) }));
    await waitFor(() => expect(screen.getByText(/No flags in Control Plane yet/)).toBeTruthy());
    expect(screen.getByRole('button', { name: /Create your first flag/ })).toBeTruthy();
  });
});

describe('sorting', () => {
  it('sorts by key ascending by default, matching the server order', async () => {
    renderPage();
    await waitForRows();
    expect(tableKeys()).toEqual([
      'tool.banner',
      'tool.model',
      'tool.rewrite',
      'tool.summarize',
      'tool.translate',
    ]);
  });

  it('reverses on a second click of the same column', async () => {
    renderPage();
    await waitForRows();
    const header = inTable().getByRole('button', { name: /^Key/ });
    fireEvent.click(header);
    await waitFor(() => expect(tableKeys()[0]).toBe('tool.translate'));
    fireEvent.click(header);
    await waitFor(() => expect(tableKeys()[0]).toBe('tool.banner'));
  });

  it('orders by status off, then rollout, then on', async () => {
    renderPage();
    await waitForRows();
    fireEvent.click(inTable().getByRole('button', { name: /^Status/ }));
    // Deliberate: sorting by status surfaces what is switched off first, which
    // is what someone looking during an incident wants.
    await waitFor(() => expect(tableKeys()[0]).toBe('tool.translate'));
    expect(tableKeys()[1]).toBe('tool.rewrite');
  });

  it('announces the sorted column to assistive tech', async () => {
    renderPage();
    await waitForRows();
    const keyHeader = inTable().getByRole('button', { name: /^Key/ }).closest('th')!;
    expect(keyHeader.getAttribute('aria-sort')).toBe('ascending');
  });
});

describe('inline editing', () => {
  it('flips a boolean, PATCHing only `enabled`, and names the flag in the toast', async () => {
    // The GET flips once the PATCH has been seen, which is what the real server
    // does - `onSettled` always refetches, so a handler frozen at the old value
    // would assert the reconcile away rather than the change.
    let patched = false;
    const { stub } = renderPage(
      pageHandlers('admin', {
        [`GET /v1/environments/${DEV_ENV_ID}/flags`]: dynamic(() =>
          patched
            ? ROWS.map((row) => (row.toolId === 't2' ? { ...row, enabled: true } : row))
            : ROWS,
        ),
        [`PATCH /v1/environments/${DEV_ENV_ID}/tools/t2/flag`]: dynamic(() => {
          patched = true;
          return { enabled: true };
        }),
      }),
    );
    await waitForRows();
    fireEvent.click(inTable().getByLabelText('Toggle tool.translate'));

    await waitFor(() =>
      expect(inTable().getByLabelText('Toggle tool.translate').getAttribute('data-state')).toBe(
        'checked',
      ),
    );
    expect(stub.calls.find((call) => call.key.startsWith('PATCH'))?.body).toEqual({
      enabled: true,
    });
    // Specific, not "Saved": this page is where people flip production switches.
    await waitFor(() => expect(screen.getByText('tool.translate turned on')).toBeTruthy());
  });

  it('writes the new state before the server replies, then rolls back on failure', async () => {
    // Starts ON and is switched OFF, so both halves are real assertions: an
    // optimistic write has to move it to unchecked, and the rollback has to put
    // it back to checked. Starting from OFF would let a no-op pass the rollback.
    //
    // The PATCH is held open until `reject()` so the optimistic state is
    // observable; an instantly-resolving stub would close the window inside one
    // microtask and this test could not tell optimism from nothing at all.
    let reject!: () => void;
    const held = new Promise<{ status: number; body: unknown }>((resolve) => {
      reject = () =>
        resolve({
          status: 403,
          body: { error: 'forbidden', message: 'Viewers cannot change flags' },
        });
    });
    renderPage(
      pageHandlers('admin', {
        [`PATCH /v1/environments/${DEV_ENV_ID}/tools/t1/flag`]: dynamic(() => held),
      }),
    );
    await waitForRows();
    const state = () =>
      inTable().getByLabelText('Toggle tool.summarize').getAttribute('data-state');
    expect(state()).toBe('checked');

    fireEvent.click(inTable().getByLabelText('Toggle tool.summarize'));
    // Optimistic: unchecked while the request is still in flight.
    await waitFor(() => expect(state()).toBe('unchecked'));

    reject();
    await waitFor(() => expect(screen.getByText('Viewers cannot change flags')).toBeTruthy());
    // The server's truth is restored before the message appears, so the row and
    // the toast never disagree.
    expect(state()).toBe('checked');
  });

  it('commits an enum choice on change', async () => {
    const { stub } = renderPage(
      pageHandlers('admin', {
        [`PATCH /v1/environments/${DEV_ENV_ID}/tools/t6/flag`]: { value: 'quality' },
      }),
    );
    await waitForRows();
    fireEvent.change(inTable().getByLabelText('Value of tool.model'), {
      target: { value: 'quality' },
    });
    await waitFor(() =>
      expect(stub.calls.find((call) => call.key.includes('t6'))?.body).toEqual({
        value: 'quality',
      }),
    );
  });

  it('saves a string value on Enter and abandons it on Escape', async () => {
    const { stub } = renderPage(
      pageHandlers('admin', {
        [`PATCH /v1/environments/${DEV_ENV_ID}/tools/t5/flag`]: { value: 'new copy' },
      }),
    );
    await waitForRows();

    fireEvent.click(inTable().getByLabelText('Edit value of tool.banner'));
    const input = inTable().getByLabelText('Value of tool.banner');
    fireEvent.change(input, { target: { value: 'abandoned' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(inTable().getByLabelText('Edit value of tool.banner')).toBeTruthy());
    expect(stub.calls.some((call) => call.key.startsWith('PATCH'))).toBe(false);

    fireEvent.click(inTable().getByLabelText('Edit value of tool.banner'));
    const reopened = inTable().getByLabelText('Value of tool.banner');
    fireEvent.change(reopened, { target: { value: 'new copy' } });
    fireEvent.keyDown(reopened, { key: 'Enter' });
    await waitFor(() =>
      expect(stub.calls.find((call) => call.key.includes('t5'))?.body).toEqual({
        value: 'new copy',
      }),
    );
  });

  it('keeps the list mounted when a value cell is used, rather than navigating', async () => {
    const { stub } = renderPage(
      pageHandlers('admin', {
        [`PATCH /v1/environments/${DEV_ENV_ID}/tools/t2/flag`]: { enabled: true },
      }),
    );
    await waitForRows();
    fireEvent.click(inTable().getByLabelText('Toggle tool.translate'));
    await waitFor(() => expect(stub.calls.some((call) => call.key.startsWith('PATCH'))).toBe(true));
    // The interactive cells stop the row's click from bubbling.
    expect(screen.getByRole('table', { name: 'Flags' })).toBeTruthy();
  });
});

describe('production safety', () => {
  it('asks for confirmation before flipping a flag in production', async () => {
    const { stub } = renderProdPage(
      pageHandlers('admin', {
        [`PATCH /v1/environments/${ENV_ID}/tools/t2/flag`]: { enabled: true },
      }),
    );
    await waitForRows();
    expect(screen.getByText('5 of 6 in Production')).toBeTruthy();

    fireEvent.click(inTable().getByLabelText('Toggle tool.translate'));
    // The first gesture arms; nothing has been sent.
    expect(stub.calls.some((call) => call.key.startsWith('PATCH'))).toBe(false);

    fireEvent.click(inTable().getByRole('button', { name: /^Confirm turning on tool\.translate/ }));
    await waitFor(() => expect(stub.calls.some((call) => call.key.startsWith('PATCH'))).toBe(true));
  });
});

describe('role gating', () => {
  it('lets a developer create and change flags', async () => {
    renderPage(pageHandlers('developer'));
    await waitForRows();
    expect(screen.getByRole('button', { name: /Create flag/ })).toBeTruthy();
    expect(inTable().getByLabelText('Toggle tool.summarize').hasAttribute('disabled')).toBe(false);
  });

  it('shows a viewer the controls, disabled, with the reason', async () => {
    renderPage(pageHandlers('viewer'));
    await waitForRows();
    expect(screen.queryByRole('button', { name: /Create flag/ })).toBeNull();
    const toggle = inTable().getByLabelText('Toggle tool.summarize');
    // Kept on the page and explained, rather than vanishing and leaving the
    // absence to be decoded.
    expect(toggle.hasAttribute('disabled')).toBe(true);
    expect(toggle.getAttribute('title')).toContain('developer or admin role');
  });
});

describe('row actions', () => {
  it('copies a flag key from the menu', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    renderPage();
    await waitForRows();

    // Radix menus do not open from a synthetic click under happy-dom: the
    // trigger opens on pointerdown, which fireEvent.click does not synthesise.
    fireEvent.keyDown(inTable().getByLabelText('Actions for tool.summarize'), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: /Copy key/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('tool.summarize'));
  });

  it('archives a flag only after the menu item is confirmed', async () => {
    const { stub } = renderPage(pageHandlers('admin', { 'PATCH /v1/tools/t1': {} }));
    await waitForRows();
    fireEvent.keyDown(inTable().getByLabelText('Actions for tool.summarize'), { key: 'Enter' });

    fireEvent.click(await screen.findByRole('menuitem', { name: /Archive flag/ }));
    expect(stub.calls.some((call) => call.key === 'PATCH /v1/tools/t1')).toBe(false);

    fireEvent.click(await screen.findByRole('menuitem', { name: /Confirm archive/ }));
    await waitFor(() =>
      expect(stub.calls.some((call) => call.key === 'PATCH /v1/tools/t1')).toBe(true),
    );
  });

  it('offers delete to an admin and withholds it from a developer', async () => {
    renderPage();
    await waitForRows();
    fireEvent.keyDown(inTable().getByLabelText('Actions for tool.summarize'), { key: 'Enter' });
    expect(await screen.findByRole('menuitem', { name: /Delete flag/ })).toBeTruthy();
    cleanup();

    renderPage(pageHandlers('developer'));
    await waitForRows();
    fireEvent.keyDown(inTable().getByLabelText('Actions for tool.summarize'), { key: 'Enter' });
    await screen.findByRole('menuitem', { name: /Archive flag/ });
    expect(screen.queryByRole('menuitem', { name: /Delete flag/ })).toBeNull();
  });
});

describe('the compact layout', () => {
  it('drives the same value controls from a card', async () => {
    const { stub } = renderPage(
      pageHandlers('admin', {
        [`PATCH /v1/environments/${DEV_ENV_ID}/tools/t6/flag`]: { value: 'fast' },
      }),
    );
    await waitForRows();
    // Same registry, so a card cannot fall behind the table.
    fireEvent.change(inCards().getByLabelText('Value of tool.model'), {
      target: { value: 'fast' },
    });
    await waitFor(() =>
      expect(stub.calls.find((call) => call.key.includes('t6'))?.body).toEqual({ value: 'fast' }),
    );
  });

  it('labels every field it shows, since there is no header row to read', async () => {
    renderPage();
    await waitForRows();
    const cards = inCards();
    expect(cards.getAllByText('Key').length).toBeGreaterThan(0);
    expect(cards.getAllByText('Current value').length).toBeGreaterThan(0);
    expect(cards.getAllByText('Updated').length).toBeGreaterThan(0);
  });

  it('opens the detail page from a card without the value cell stealing the click', async () => {
    const { stub } = renderPage();
    await waitForRows();
    fireEvent.click(inCards().getByText('Summarize'));
    // No mutation from a navigation click.
    expect(stub.calls.some((call) => call.key.startsWith('PATCH'))).toBe(false);
  });
});

describe('destructive actions', () => {
  it('deletes a flag after confirmation', async () => {
    const { stub } = renderPage(pageHandlers('admin', { 'DELETE /v1/tools/t1': { status: 204 } }));
    await waitForRows();
    fireEvent.keyDown(inTable().getByLabelText('Actions for tool.summarize'), { key: 'Enter' });

    fireEvent.click(await screen.findByRole('menuitem', { name: /Delete flag/ }));
    expect(stub.calls.some((call) => call.key === 'DELETE /v1/tools/t1')).toBe(false);

    fireEvent.click(await screen.findByRole('menuitem', { name: /cannot be undone/ }));
    await waitFor(() =>
      expect(stub.calls.some((call) => call.key === 'DELETE /v1/tools/t1')).toBe(true),
    );
    await waitFor(() => expect(screen.getByText('tool.summarize deleted')).toBeTruthy());
  });

  it('explains a failed delete instead of pretending it worked', async () => {
    renderPage(
      pageHandlers('admin', {
        'DELETE /v1/tools/t1': {
          status: 409,
          body: { error: 'conflict', message: 'Archive it first' },
        },
      }),
    );
    await waitForRows();
    fireEvent.keyDown(inTable().getByLabelText('Actions for tool.summarize'), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: /Delete flag/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /cannot be undone/ }));
    await waitFor(() => expect(screen.getByText('Archive it first')).toBeTruthy());
  });

  it('explains a failed archive too', async () => {
    renderPage(
      pageHandlers('admin', {
        'PATCH /v1/tools/t1': {
          status: 403,
          body: { error: 'forbidden', message: 'Not your project' },
        },
      }),
    );
    await waitForRows();
    fireEvent.keyDown(inTable().getByLabelText('Actions for tool.summarize'), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: /Archive flag/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Confirm archive/ }));
    await waitFor(() => expect(screen.getByText('Not your project')).toBeTruthy());
  });

  it('offers to restore an archived flag rather than to archive it again', async () => {
    renderPage();
    await waitForRows();
    await openFilters();
    fireEvent.click(screen.getByLabelText('Show archived flags'));
    await waitFor(() => expect(tableKeys()).toContain('tool.legacy'));

    fireEvent.keyDown(inTable().getByLabelText('Actions for tool.legacy'), { key: 'Enter' });
    expect(await screen.findByRole('menuitem', { name: /Restore flag/ })).toBeTruthy();
  });
});

describe('the empty project', () => {
  it('does not invite a viewer to create the first flag', async () => {
    renderPage(pageHandlers('viewer', { ...flagsFor(DEV_ENV_ID, []) }));
    await waitFor(() => expect(screen.getByText(/No flags in Control Plane yet/)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Create your first flag/ })).toBeNull();
  });
});

describe('paging', () => {
  it('renders one page at a time and says how much is hidden', async () => {
    const many = Array.from({ length: 130 }, (_, index) =>
      flagRow({
        id: `m${index}`,
        key: `tool.m${String(index).padStart(3, '0')}`,
        name: `Many ${index}`,
      }),
    );
    renderPage(
      pageHandlers('admin', {
        ...flagsFor(DEV_ENV_ID, many),
        [`GET /v1/projects/${PROJECT_ID}/tools`]: [],
      }),
    );
    await waitForRows();

    // A truncated list that does not say so reads as a complete one.
    await waitFor(() => expect(screen.getByText('Showing 1–100 of 130')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Show 30 more' }));
    await waitFor(() => expect(screen.getByText('Showing 130 of 130')).toBeTruthy());
  });
});
