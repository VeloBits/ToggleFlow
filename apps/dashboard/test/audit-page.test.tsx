// @vitest-environment happy-dom
/**
 * The audit log screen: the readable summary that replaced the raw-JSON cell,
 * the two ways into an event's full record, filtering, actor resolution and
 * cursor pagination.
 *
 * ## Convention: always scope a list assertion to one layout
 *
 * The page renders the table AND the compact card list on every paint and lets
 * CSS choose at `md` (see AuditCards' docblock for why that beats a `matchMedia`
 * hook). Every entry is therefore in the DOM twice, and a bare
 * `getByText('Enabled')` throws "found multiple elements". Scope with
 * `inTable()` or `inCards()`.
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuditEntry, Member } from '../src/api/client';
import { AuditLogPage } from '../src/features/audit';
import {
  ENV_ID,
  ORG_ID,
  PROJECT_ID,
  dynamic,
  renderWithProviders,
  stubAuth,
  stubFetch,
  workspaceHandlers,
  type FetchStub,
  type Handlers,
} from './harness';

const AUDIT_URL = `/v1/orgs/${ORG_ID}/audit`;
const MEMBERS_URL = `/v1/orgs/${ORG_ID}/members`;

const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 'a1',
  actorId: 'u1',
  action: 'flag.update',
  entityType: 'flag_state',
  entityId: 'fs1',
  before: { enabled: true },
  after: { enabled: false },
  createdAt: '2026-07-20T10:00:00.000Z',
  ...over,
});

const members: Member[] = [
  {
    userId: 'u1',
    email: 'dev@velobits.test',
    displayName: 'Dev User',
    role: 'admin',
    createdAt: '2026-07-01T00:00:00.000Z',
  },
  {
    userId: 'u2',
    email: 'ops@velobits.test',
    displayName: null,
    role: 'developer',
    createdAt: '2026-07-01T00:00:00.000Z',
  },
];

/** A full page is exactly the request limit, which is what unlocks pagination. */
const fullPage = (prefix: string) =>
  Array.from({ length: 50 }, (_, i) =>
    entry({
      id: `${prefix}-${i}`,
      entityId: `${prefix}-${i}`,
      createdAt: `2026-07-${String(20 - (i % 19)).padStart(2, '0')}T10:00:00.000Z`,
    }),
  );

const pageHandlers = (over: Handlers = {}): Handlers => ({
  ...workspaceHandlers(),
  [`GET ${AUDIT_URL}`]: { entries: [entry()] },
  [`GET ${MEMBERS_URL}`]: members,
  ...over,
});

function renderPage(handlers: Handlers = pageHandlers()): { stub: FetchStub } {
  stubAuth();
  const stub = stubFetch(handlers);
  renderWithProviders(<AuditLogPage />);
  return { stub };
}

const inTable = () => within(screen.getByRole('table', { name: 'Audit log' }));
const inCards = () => within(screen.getByRole('list', { name: 'Audit log (compact)' }));
const panel = () => within(screen.getByRole('dialog'));

const rowCount = () => inTable().getAllByTestId('audit-row').length;
const waitForRows = () => waitFor(() => expect(rowCount()).toBeGreaterThan(0));

const openFilters = async () => {
  fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
  await waitFor(() => expect(screen.getByLabelText('Area')).toBeTruthy());
};

/**
 * Radix tabs activate on mouseDown, not click - the same quirk
 * flag-detail-page.test.tsx works around, and a plain `click` silently does
 * nothing here.
 */
const openTab = async (name: string) => {
  const trigger = panel().getByRole('tab', { name });
  fireEvent.mouseDown(trigger);
  await waitFor(() => expect(trigger.getAttribute('data-state')).toBe('active'));
};

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('loading', () => {
  it('shows a table-shaped skeleton before the first page lands', async () => {
    // Held open so the pending state can be observed rather than raced.
    let resolve!: () => void;
    const held = new Promise<{ entries: AuditEntry[] }>((done) => {
      resolve = () => done({ entries: [entry()] });
    });
    renderPage(pageHandlers({ [`GET ${AUDIT_URL}`]: dynamic(() => held) }));

    await waitFor(() => expect(screen.getByText('Loading the audit log…')).toBeTruthy());
    // The filters are inert while there is nothing to filter.
    expect(screen.getByLabelText('Search the audit log')).toHaveProperty('disabled', true);

    resolve();
    await waitForRows();
    expect(screen.queryByText('Loading the audit log…')).toBeNull();
  });
});

describe('the readable summary', () => {
  it('states what happened in words instead of dumping the payload', async () => {
    renderPage();
    await waitForRows();

    const row = inTable();
    expect(row.getByText('CHANGED')).toBeTruthy();
    expect(row.getByText('Enabled')).toBeTruthy();
    expect(row.getByText('ON')).toBeTruthy();
    expect(row.getByText('OFF')).toBeTruthy();
    // The thing this rewrite exists to remove.
    expect(screen.queryByText(/^\{"before"/)).toBeNull();
  });

  it('keeps the machine action reachable behind the friendly label', async () => {
    // "CHANGED" is what a reader wants; `flag.update` is what they paste into a
    // support thread.
    renderPage();
    await waitForRows();
    expect(inTable().getByTitle('flag.update')).toBeTruthy();
  });

  it('names the target from the payload rather than from a lookup', async () => {
    renderPage(
      pageHandlers({
        [`GET ${AUDIT_URL}`]: {
          entries: [
            entry({
              action: 'tool.create',
              entityType: 'tool',
              before: null,
              after: { key: 'checkout.v2', name: 'Checkout', valueType: 'boolean' },
            }),
          ],
        },
      }),
    );
    await waitForRows();

    const row = inTable();
    expect(row.getByText('CREATED')).toBeTruthy();
    // A creation reads as a snapshot, not as a diff from nothing.
    expect(row.getByText('Key')).toBeTruthy();
    expect(row.queryByText('not set')).toBeNull();
  });

  it('resolves an environment id through the workspace when the payload has no name', async () => {
    renderPage(
      pageHandlers({
        [`GET ${AUDIT_URL}`]: {
          entries: [
            entry({
              action: 'ruleset.republish',
              entityType: 'environment',
              entityId: ENV_ID,
              before: null,
              after: { version: 4, contentHash: 'abc123def456789' },
            }),
          ],
        },
      }),
    );
    await waitForRows();
    expect(inTable().getByText('PUBLISHED')).toBeTruthy();
    await waitFor(() => expect(inTable().getByText('Production')).toBeTruthy());
  });

  it('says so plainly when an event recorded no payload', async () => {
    renderPage(
      pageHandlers({
        [`GET ${AUDIT_URL}`]: { entries: [entry({ before: null, after: null })] },
      }),
    );
    await waitForRows();
    // The old cell printed the entity type here, which read as though
    // "flag_state" were the change.
    expect(inTable().getByText('No details recorded')).toBeTruthy();
  });

  it('counts the fields it left out of the compact cell', async () => {
    renderPage(
      pageHandlers({
        [`GET ${AUDIT_URL}`]: {
          entries: [
            entry({
              before: { enabled: true, rolloutPercent: 10, targetingRules: [] },
              after: { enabled: false, rolloutPercent: 50, targetingRules: [{ a: 1 }] },
            }),
          ],
        },
      }),
    );
    await waitForRows();
    expect(inTable().getByText('+1 more field')).toBeTruthy();
  });

  it('shows an empty state', async () => {
    renderPage(pageHandlers({ [`GET ${AUDIT_URL}`]: { entries: [] } }));
    await waitFor(() => expect(screen.getByText('No activity yet')).toBeTruthy());
  });

  it('surfaces a load failure', async () => {
    renderPage(
      pageHandlers({
        [`GET ${AUDIT_URL}`]: { status: 403, body: { error: 'forbidden', message: 'no audit' } },
      }),
    );
    await waitFor(() => expect(screen.getByText('no audit')).toBeTruthy());
  });
});

describe('expanding a row', () => {
  it('reveals the full record in place, JSON included', async () => {
    renderPage();
    await waitForRows();

    fireEvent.click(inTable().getByRole('button', { name: /^Expand details for/ }));

    await waitFor(() => expect(inTable().getByText('Entity ID')).toBeTruthy());
    const row = inTable();
    // The metadata block carries the ids the friendly label hides.
    expect(row.getByText('fs1')).toBeTruthy();
    // Indented and highlighted, not the one-line stringify the cell used to show.
    expect(row.getByRole('region', { name: /before payload/i })).toBeTruthy();
    expect(row.getByRole('region', { name: /after payload/i })).toBeTruthy();
  });

  it('collapses again, and says which state it is in', async () => {
    renderPage();
    await waitForRows();

    const expand = inTable().getByRole('button', { name: /^Expand details for/ });
    expect(expand.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(expand);
    const collapse = await waitFor(() =>
      inTable().getByRole('button', { name: /^Collapse details for/ }),
    );
    expect(collapse.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(collapse);
    await waitFor(() =>
      expect(inTable().queryByRole('button', { name: /^Collapse details for/ })).toBeNull(),
    );
  });

  it('lets two rows be open at once, which is why they compare', async () => {
    renderPage(
      pageHandlers({
        [`GET ${AUDIT_URL}`]: {
          entries: [entry(), entry({ id: 'a2', entityId: 'fs2', actorId: 'u2' })],
        },
      }),
    );
    await waitForRows();

    for (const button of inTable().getAllByRole('button', { name: /^Expand details for/ })) {
      fireEvent.click(button);
    }
    await waitFor(() =>
      expect(inTable().getAllByRole('button', { name: /^Collapse details for/ })).toHaveLength(2),
    );
  });

  it('separates event context from the fields that were recorded', async () => {
    // environment.create records projectId and its inheritance provenance beside
    // the environment's own fields; "Project" among the changes would imply the
    // project was edited.
    renderPage(
      pageHandlers({
        [`GET ${AUDIT_URL}`]: {
          entries: [
            entry({
              action: 'environment.create',
              entityType: 'environment',
              entityId: 'e2',
              before: null,
              after: {
                key: 'staging',
                name: 'Staging',
                projectId: PROJECT_ID,
                inheritedFrom: { id: ENV_ID, key: 'prod' },
                copied: { flagStates: 5, toolConfigs: 2 },
              },
            }),
          ],
        },
      }),
    );
    await waitForRows();
    fireEvent.click(inTable().getByRole('button', { name: /^Expand details for/ }));

    await waitFor(() => expect(inTable().getByText('Recorded')).toBeTruthy());
    const row = inTable();
    // Context, in the metadata block.
    expect(row.getByText('Project')).toBeTruthy();
    // Recorded fields, as a snapshot rather than a diff.
    expect(row.getByText('Inherited from')).toBeTruthy();
    expect(row.getByText('Flag States 5, Tool Configs 2')).toBeTruthy();
  });

  it('says plainly when a patch changed nothing', async () => {
    // A re-serialised targeting rule can come back key-reordered; claiming a
    // change there would train people to ignore this screen.
    renderPage(
      pageHandlers({
        [`GET ${AUDIT_URL}`]: {
          entries: [
            entry({
              before: { targetingRules: [{ attribute: 'plan', op: 'in' }] },
              after: { targetingRules: [{ op: 'in', attribute: 'plan' }] },
            }),
          ],
        },
      }),
    );
    await waitForRows();
    expect(inTable().getByText('No fields changed')).toBeTruthy();

    fireEvent.click(inTable().getByRole('button', { name: /^Expand details for/ }));
    await waitFor(() =>
      expect(inTable().getByText('The payload recorded no field-level change.')).toBeTruthy(),
    );
  });

  it('says plainly when the event carried no payload at all', async () => {
    renderPage(
      pageHandlers({
        [`GET ${AUDIT_URL}`]: { entries: [entry({ before: null, after: null })] },
      }),
    );
    await waitForRows();
    fireEvent.click(inTable().getByRole('button', { name: /^Expand details for/ }));

    await waitFor(() =>
      expect(
        inTable().getByText('This event was recorded without a before or after payload.'),
      ).toBeTruthy(),
    );
    // Both payloads render as a dash rather than as the string "null".
    expect(inTable().getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('does not open the panel when the chevron is used', async () => {
    // The two affordances are distinct: expanding keeps your place in the list.
    renderPage();
    await waitForRows();
    fireEvent.click(inTable().getByRole('button', { name: /^Expand details for/ }));
    await waitFor(() => expect(inTable().getByText('Entity ID')).toBeTruthy());
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('the detail panel', () => {
  const open = async () => {
    fireEvent.click(inTable().getByRole('button', { name: /^Open full details for/ }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
  };

  it('opens from the row, with the changes tab first', async () => {
    renderPage();
    await waitForRows();
    await open();

    const view = panel();
    expect(view.getByRole('tab', { name: 'Changes' })).toBeTruthy();
    // A labelled grid, not a JSON string.
    expect(view.getByText('Field')).toBeTruthy();
    expect(view.getByText('Changed by')).toBeTruthy();
    expect(view.getByText('Dev User')).toBeTruthy();
  });

  it('shows a unified diff on the diff tab', async () => {
    renderPage();
    await waitForRows();
    await open();

    await openTab('Diff');
    const diff = panel().getByRole('region', { name: /diff/i });
    // Marked as well as tinted, so colour is not the only signal.
    expect(diff.textContent).toContain('+');
    expect(panel().getByText(/added/)).toBeTruthy();
  });

  it('shows indented raw JSON on the raw tab', async () => {
    renderPage();
    await waitForRows();
    await open();

    await openTab('Raw JSON');
    const raw = panel().getByRole('region', { name: /after payload/i });
    // Indented and tokenised, not the single-line stringify the old cell showed.
    expect(raw.textContent).toContain('"enabled"');
    expect(raw.textContent).toContain('\n');
    expect(panel().getByRole('button', { name: /^Copy the after payload/ })).toBeTruthy();
  });

  it('closes on Escape', async () => {
    renderPage();
    await waitForRows();
    await open();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes on the close button', async () => {
    renderPage();
    await waitForRows();
    await open();

    fireEvent.click(panel().getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('opens from a card on a narrow viewport', async () => {
    renderPage();
    await waitForRows();
    fireEvent.click(inCards().getByRole('button', { name: /^Open full details for/ }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
  });

  it('names the target on a card when the payload records one', async () => {
    // The card omits the target line entirely for an event with no resolvable
    // target, rather than printing a lone dash on a cramped layout.
    renderPage(
      pageHandlers({
        [`GET ${AUDIT_URL}`]: {
          entries: [
            entry({
              action: 'segment.delete',
              entityType: 'segment',
              before: { key: 'beta', name: 'Beta users' },
              after: null,
            }),
          ],
        },
      }),
    );
    await waitForRows();
    // The label is unique to the target line; the key itself also appears as a
    // recorded field below it, which is why this counts rather than singles out.
    expect(inCards().getByText('Segment')).toBeTruthy();
    expect(inCards().getAllByText('beta').length).toBeGreaterThan(0);
    expect(inCards().getByText('Beta users')).toBeTruthy();
  });
});

describe('filtering', () => {
  const mixed = [
    entry({ id: 'a1', actorId: 'u1' }),
    entry({
      id: 'a2',
      action: 'api_key.create',
      entityType: 'api_key',
      entityId: 'k1',
      actorId: 'u2',
      before: null,
      after: { name: 'CI key', kind: 'server', prefix: 'tf_s_abc' },
    }),
    entry({
      id: 'a3',
      action: 'tool.bulk_upsert',
      entityType: 'project',
      entityId: PROJECT_ID,
      actorId: null,
      before: null,
      after: { created: ['checkout.v2'], updated: [], archived: [], unchanged: 3 },
    }),
  ];

  const search = (value: string) =>
    fireEvent.change(screen.getByLabelText('Search the audit log'), { target: { value } });

  it('narrows by free text across every column', async () => {
    renderPage(pageHandlers({ [`GET ${AUDIT_URL}`]: { entries: mixed } }));
    await waitFor(() => expect(rowCount()).toBe(3));

    search('CI key');
    await waitFor(() => expect(rowCount()).toBe(1));
    expect(inTable().getByText('ISSUED')).toBeTruthy();
  });

  it('searches the payload, which is the only place a bulk sync names its flags', async () => {
    renderPage(pageHandlers({ [`GET ${AUDIT_URL}`]: { entries: mixed } }));
    await waitFor(() => expect(rowCount()).toBe(3));

    search('checkout.v2');
    await waitFor(() => expect(rowCount()).toBe(1));
    expect(inTable().getByText('SYNCED')).toBeTruthy();
  });

  it('narrows by area, counting the axis on the trigger', async () => {
    renderPage(pageHandlers({ [`GET ${AUDIT_URL}`]: { entries: mixed } }));
    await waitFor(() => expect(rowCount()).toBe(3));
    await openFilters();

    fireEvent.change(screen.getByLabelText('Area'), { target: { value: 'access' } });
    await waitFor(() => expect(rowCount()).toBe(1));
    expect(screen.getByRole('button', { name: /Filters/ }).textContent).toContain('1');
  });

  it('narrows by actor, and offers only the people actually present', async () => {
    renderPage(pageHandlers({ [`GET ${AUDIT_URL}`]: { entries: mixed } }));
    await waitFor(() => expect(rowCount()).toBe(3));
    await openFilters();

    const select = screen.getByLabelText('Changed by') as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent)).toEqual([
      'Anyone',
      'Dev User',
      'ops@velobits.test',
      'system',
    ]);

    fireEvent.change(select, { target: { value: 'u2' } });
    await waitFor(() => expect(rowCount()).toBe(1));
  });

  it('attributes an entry with no actor to the system, and can filter to it', async () => {
    renderPage(pageHandlers({ [`GET ${AUDIT_URL}`]: { entries: mixed } }));
    await waitFor(() => expect(rowCount()).toBe(3));
    await openFilters();

    fireEvent.change(screen.getByLabelText('Changed by'), { target: { value: 'system' } });
    await waitFor(() => expect(rowCount()).toBe(1));
    expect(inTable().getByText('system')).toBeTruthy();
  });

  it('clears the axes from the filter panel while keeping the search text', async () => {
    // Two different "Clear filters" buttons exist by design - this one, and the
    // one on the no-matches empty state. They are never on screen together.
    renderPage(pageHandlers({ [`GET ${AUDIT_URL}`]: { entries: mixed } }));
    await waitFor(() => expect(rowCount()).toBe(3));

    // A search term that still matches under the area filter, so the no-matches
    // empty state - which has a Clear filters button of its own - stays away.
    search('CI');
    await openFilters();
    fireEvent.change(screen.getByLabelText('Area'), { target: { value: 'access' } });
    await waitFor(() => expect(rowCount()).toBe(1));

    fireEvent.click(screen.getByRole('button', { name: /Clear filters/ }));
    await waitFor(() => expect(screen.getByLabelText('Area')).toHaveProperty('value', 'all'));
    expect(screen.getByLabelText('Search the audit log')).toHaveProperty('value', 'CI');
    // Cleared axes, kept text: still one row, now on the search alone.
    expect(rowCount()).toBe(1);
  });

  it('offers a way out when the filters match nothing', async () => {
    renderPage(pageHandlers({ [`GET ${AUDIT_URL}`]: { entries: mixed } }));
    await waitFor(() => expect(rowCount()).toBe(3));

    search('nothing matches this');
    await waitFor(() => expect(screen.getByText('Nothing matches these filters')).toBeTruthy());
    expect(screen.getByText('3 entries loaded, none of them matching.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(rowCount()).toBe(3));
  });
});

describe('actor resolution', () => {
  it('prefers the display name', async () => {
    renderPage();
    await waitForRows();
    expect(inTable().getByText('Dev User')).toBeTruthy();
  });

  it('falls back to the email when there is no display name', async () => {
    renderPage(pageHandlers({ [`GET ${AUDIT_URL}`]: { entries: [entry({ actorId: 'u2' })] } }));
    await waitFor(() => expect(inTable().getByText('ops@velobits.test')).toBeTruthy());
  });

  it('shows a truncated id for an actor who is no longer a member', async () => {
    // /members lists current membership only, so a departed colleague's entries
    // still have to attribute to somebody.
    renderPage(
      pageHandlers({
        [`GET ${AUDIT_URL}`]: { entries: [entry({ actorId: 'deadbeef-gone-forever' })] },
      }),
    );
    await waitFor(() => expect(inTable().getByText('deadbeef')).toBeTruthy());
  });

  it('attributes a null actor to the system', async () => {
    renderPage(pageHandlers({ [`GET ${AUDIT_URL}`]: { entries: [entry({ actorId: null })] } }));
    await waitFor(() => expect(inTable().getByText('system')).toBeTruthy());
  });
});

describe('pagination', () => {
  it('offers no Load older on a partial page', async () => {
    renderPage();
    await waitForRows();
    expect(screen.queryByText('Load older')).toBeNull();
    expect(screen.getByText('1 entry loaded')).toBeTruthy();
  });

  it('pages with a before cursor and keeps earlier pages on screen', async () => {
    const first = fullPage('first');
    const oldest = first.at(-1)!;
    const { stub } = renderPage(
      pageHandlers({
        [`GET ${AUDIT_URL}`]: dynamic(({ url }) =>
          url.includes('before=')
            ? { entries: [entry({ id: 'older-1', entityId: 'older-1' })] }
            : { entries: first },
        ),
      }),
    );

    await waitFor(() => expect(screen.getByText('Load older')).toBeTruthy());
    expect(screen.getByText('50 entries loaded')).toBeTruthy();

    fireEvent.click(screen.getByText('Load older'));

    // The first page is retained above the newly fetched one.
    await waitFor(() => expect(screen.getByText('51 entries loaded')).toBeTruthy());
    // The cursor is the createdAt of the last row of the previous page.
    expect(
      stub.calls.some((c) => c.key.includes(`before=${encodeURIComponent(oldest.createdAt)}`)),
    ).toBe(true);
    // A short second page ends pagination.
    expect(screen.queryByText('Load older')).toBeNull();
  });

  it('keeps the button on screen, disabled, while the older page is in flight', async () => {
    // Advancing the cursor changes the query key, so `data` is briefly undefined
    // - without the in-flight guard the button would blink out mid-click.
    let resolve!: () => void;
    const held = new Promise<{ entries: AuditEntry[] }>((done) => {
      resolve = () => done({ entries: [entry({ id: 'older-1', entityId: 'older-1' })] });
    });
    renderPage(
      pageHandlers({
        [`GET ${AUDIT_URL}`]: dynamic(({ url }) =>
          url.includes('before=') ? held : { entries: fullPage('first') },
        ),
      }),
    );

    await waitFor(() => expect(screen.getByText('Load older')).toBeTruthy());
    fireEvent.click(screen.getByText('Load older'));

    const loading = await waitFor(() => screen.getByText('Loading…'));
    expect(loading.closest('button')).toHaveProperty('disabled', true);
    // The pages already read stay on screen behind it.
    expect(screen.getByText('50 entries loaded')).toBeTruthy();

    resolve();
    await waitFor(() => expect(screen.getByText('51 entries loaded')).toBeTruthy());
  });

  it('reports the filtered count against the loaded count, never a fake total', async () => {
    // The server reports no total and the table is still being written to, so a
    // number presented as the total would be a number that is wrong.
    renderPage(
      pageHandlers({
        [`GET ${AUDIT_URL}`]: {
          entries: [entry(), entry({ id: 'a2', actorId: 'u2', entityId: 'fs2' })],
        },
      }),
    );
    await waitFor(() => expect(screen.getByText('2 entries loaded')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Search the audit log'), { target: { value: 'ops@' } });
    await waitFor(() => expect(screen.getByText('1 of 2 loaded entries')).toBeTruthy());
  });
});
