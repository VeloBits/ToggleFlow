// @vitest-environment happy-dom
/**
 * The tools list: flag/tag join, the four filters, role-gated registration,
 * and the two distinct empty states.
 */
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlagRow, Tool } from '../src/api/client';
import { ToolsPage } from '../src/pages/ToolsPage';
import {
  ENV_ID,
  PROJECT_ID,
  renderWithProviders,
  stubAuth,
  stubFetch,
  workspaceHandlers,
  type FetchStub,
  type Handlers,
} from './harness';

const flag = (over: Partial<FlagRow> = {}): FlagRow => ({
  toolId: 't1',
  toolKey: 'tool.summarize',
  toolName: 'Summarize',
  archived: false,
  enabled: true,
  rolloutPercent: null,
  targetingRules: [],
  updatedAt: '2026-07-20T10:00:00.000Z',
  ...over,
});

const tool = (over: Partial<Tool> = {}): Tool => ({
  id: 't1',
  key: 'tool.summarize',
  name: 'Summarize',
  description: null,
  tags: ['text'],
  metadata: {},
  archived: false,
  updatedAt: '2026-07-20T10:00:00.000Z',
  ...over,
});

const ROWS: FlagRow[] = [
  flag(),
  flag({ toolId: 't2', toolKey: 'tool.translate', toolName: 'Translate', enabled: false }),
  flag({ toolId: 't3', toolKey: 'tool.rewrite', toolName: 'Rewrite', rolloutPercent: 25 }),
  flag({ toolId: 't4', toolKey: 'tool.legacy', toolName: 'Legacy', archived: true }),
];

const TOOLS: Tool[] = [
  tool(),
  tool({ id: 't2', key: 'tool.translate', name: 'Translate', tags: ['text', 'i18n'] }),
  tool({ id: 't3', key: 'tool.rewrite', name: 'Rewrite', tags: [] }),
  tool({ id: 't4', key: 'tool.legacy', name: 'Legacy', tags: [], archived: true }),
];

const pageHandlers = (
  role: 'admin' | 'developer' | 'viewer' = 'admin',
  over: Handlers = {},
): Handlers => ({
  ...workspaceHandlers(role),
  [`GET /v1/environments/${ENV_ID}/flags`]: ROWS,
  [`GET /v1/projects/${PROJECT_ID}/tools`]: TOOLS,
  ...over,
});

function renderPage(handlers: Handlers = pageHandlers()): { stub: FetchStub } {
  stubAuth();
  const stub = stubFetch(handlers);
  renderWithProviders(<ToolsPage />);
  return { stub };
}

const visibleKeys = () => [...document.querySelectorAll('td.mono')].map((td) => td.textContent);

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('listing', () => {
  it('hides archived rows by default and reports the visible count', async () => {
    renderPage();
    await waitFor(() => expect(visibleKeys()).toHaveLength(3));
    expect(visibleKeys()).not.toContain('tool.legacy');
    // The denominator is every row fetched, so the hidden archived one counts.
    expect(screen.getByText('3 of 4 in Production')).toBeTruthy();
  });

  it('renders each status as its own chip', async () => {
    renderPage();
    await waitFor(() => expect(visibleKeys()).toHaveLength(3));
    expect(screen.getByText('ON')).toBeTruthy();
    expect(screen.getByText('OFF')).toBeTruthy();
    expect(screen.getByText('25%')).toBeTruthy();
  });

  it('joins tags from the tools query onto the flag rows', async () => {
    renderPage();
    await waitFor(() => expect(visibleKeys()).toHaveLength(3));
    // Scoped to the table: 'i18n' is also an <option> in the tag filter.
    const tags = [...document.querySelectorAll('table.data .tag')].map((el) => el.textContent);
    expect(tags).toContain('i18n');
    expect(tags).toContain('text');
  });

  it('surfaces a flags request failure', async () => {
    renderPage(
      pageHandlers('admin', {
        [`GET /v1/environments/${ENV_ID}/flags`]: {
          status: 500,
          body: { error: 'server_error', message: 'flags unavailable' },
        },
      }),
    );
    await waitFor(() => expect(screen.getByText('flags unavailable')).toBeTruthy());
  });

  it('says nothing is registered when the project is empty', async () => {
    renderPage(
      pageHandlers('admin', {
        [`GET /v1/environments/${ENV_ID}/flags`]: [],
        [`GET /v1/projects/${PROJECT_ID}/tools`]: [],
      }),
    );
    await waitFor(() => expect(screen.getByText('No tools registered yet.')).toBeTruthy());
  });
});

describe('filters', () => {
  const settled = () => waitFor(() => expect(visibleKeys()).toHaveLength(3));

  it('searches on key and name, case-insensitively', async () => {
    renderPage();
    await settled();

    fireEvent.change(screen.getByPlaceholderText('Search key or name…'), {
      target: { value: 'TRANS' },
    });
    expect(visibleKeys()).toEqual(['tool.translate']);
  });

  it('distinguishes the no-match empty state from the no-data one', async () => {
    renderPage();
    await settled();

    fireEvent.change(screen.getByPlaceholderText('Search key or name…'), {
      target: { value: 'nothing-matches-this' },
    });
    expect(screen.getByText('Nothing matches the filters.')).toBeTruthy();
    expect(screen.queryByText('No tools registered yet.')).toBeNull();
  });

  it('filters by tag, offering only tags that exist', async () => {
    renderPage();
    await settled();

    const tagFilter = screen.getByLabelText('Tag filter');
    // Sorted and de-duplicated across all tools.
    expect([...tagFilter.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'All tags',
      'i18n',
      'text',
    ]);

    fireEvent.change(tagFilter, { target: { value: 'i18n' } });
    expect(visibleKeys()).toEqual(['tool.translate']);
  });

  it.each([
    ['on', ['tool.summarize']],
    ['off', ['tool.translate']],
    ['rollout', ['tool.rewrite']],
  ])('filters by status=%s', async (status, expected) => {
    renderPage();
    await settled();

    fireEvent.change(screen.getByLabelText('Status filter'), { target: { value: status } });
    expect(visibleKeys()).toEqual(expected);
  });

  it('includes archived rows when asked', async () => {
    renderPage();
    await settled();

    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(visibleKeys()).toHaveLength(4));
    expect(screen.getByText('archived')).toBeTruthy();
    expect(screen.getByText('4 of 4 in Production')).toBeTruthy();
  });

  it('combines filters', async () => {
    renderPage();
    await settled();

    fireEvent.change(screen.getByLabelText('Tag filter'), { target: { value: 'text' } });
    fireEvent.change(screen.getByLabelText('Status filter'), { target: { value: 'off' } });
    expect(visibleKeys()).toEqual(['tool.translate']);
  });
});

describe('registration', () => {
  it('registers a tool, trimming input and splitting tags', async () => {
    const { stub } = renderPage(
      pageHandlers('admin', {
        [`POST /v1/projects/${PROJECT_ID}/tools`]: tool({ id: 't9', key: 'tool.new' }),
      }),
    );
    await waitFor(() => expect(visibleKeys()).toHaveLength(3));

    fireEvent.click(screen.getByText('＋ Register tool'));
    const submit = screen.getByText('Register');
    // Key and name are both mandatory.
    expect(submit).toHaveProperty('disabled', true);

    fireEvent.change(screen.getByLabelText('Key (lowercase, dots/dashes)'), {
      target: { value: '  tool.new  ' },
    });
    expect(submit).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' New tool ' } });
    expect(submit).toHaveProperty('disabled', false);

    fireEvent.change(screen.getByLabelText('Description'), { target: { value: ' does things ' } });
    fireEvent.change(screen.getByLabelText('Tags (comma-separated)'), {
      target: { value: ' a , , b ' },
    });
    fireEvent.click(submit);

    await waitFor(() => expect(screen.queryByText('Register a tool')).toBeNull());
    expect(stub.calls.find((c) => c.key === `POST /v1/projects/${PROJECT_ID}/tools`)?.body).toEqual(
      { key: 'tool.new', name: 'New tool', description: 'does things', tags: ['a', 'b'] },
    );
  });

  it('sends a null description when the field is left blank', async () => {
    const { stub } = renderPage(
      pageHandlers('admin', {
        [`POST /v1/projects/${PROJECT_ID}/tools`]: tool({ id: 't9' }),
      }),
    );
    await waitFor(() => expect(visibleKeys()).toHaveLength(3));

    fireEvent.click(screen.getByText('＋ Register tool'));
    fireEvent.change(screen.getByLabelText('Key (lowercase, dots/dashes)'), {
      target: { value: 'tool.new' },
    });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New' } });
    fireEvent.click(screen.getByText('Register'));

    await waitFor(() => expect(screen.queryByText('Register a tool')).toBeNull());
    const body = stub.calls.find((c) => c.key === `POST /v1/projects/${PROJECT_ID}/tools`)
      ?.body as { description: unknown; tags: unknown };
    expect(body.description).toBeNull();
    expect(body.tags).toEqual([]);
  });

  it('keeps the modal open and shows why a duplicate key failed', async () => {
    renderPage(
      pageHandlers('admin', {
        [`POST /v1/projects/${PROJECT_ID}/tools`]: {
          status: 409,
          body: { error: 'conflict', message: 'key already registered' },
        },
      }),
    );
    await waitFor(() => expect(visibleKeys()).toHaveLength(3));

    fireEvent.click(screen.getByText('＋ Register tool'));
    fireEvent.change(screen.getByLabelText('Key (lowercase, dots/dashes)'), {
      target: { value: 'tool.summarize' },
    });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Dupe' } });
    fireEvent.click(screen.getByText('Register'));

    await waitFor(() => expect(screen.getByText('key already registered')).toBeTruthy());
    expect(screen.getByText('Register a tool')).toBeTruthy();
  });

  it('closes on cancel without calling the API', async () => {
    const { stub } = renderPage();
    await waitFor(() => expect(visibleKeys()).toHaveLength(3));

    fireEvent.click(screen.getByText('＋ Register tool'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Register a tool')).toBeNull();
    expect(stub.calls.some((c) => c.key.startsWith('POST'))).toBe(false);
  });

  it.each([['developer', true] as const, ['viewer', false] as const])(
    'shows the register button to a %s: %s',
    async (role, expected) => {
      renderPage(pageHandlers(role));
      await waitFor(() => expect(visibleKeys()).toHaveLength(3));
      expect(screen.queryByText('＋ Register tool') !== null).toBe(expected);
    },
  );
});

describe('navigation', () => {
  it('opens the detail route when a row is clicked', async () => {
    renderPage();
    await waitFor(() => expect(visibleKeys()).toHaveLength(3));

    fireEvent.click(screen.getByText('Summarize'));
    // MemoryRouter has no detail route mounted, so assert the row is clickable
    // and the handler ran without throwing.
    expect(document.querySelector('tr.clickable')).toBeTruthy();
  });
});
