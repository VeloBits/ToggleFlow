// @vitest-environment happy-dom
/**
 * Segments admin: list, create vs edit (the key is immutable once set),
 * condition-JSON validation against the engine schema, and delete.
 */
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Segment } from '../src/api/client';
import { SegmentsPage } from '../src/pages/SegmentsPage';
import {
  PROJECT_ID,
  renderWithProviders,
  stubAuth,
  stubFetch,
  workspaceHandlers,
  type FetchStub,
  type Handlers,
} from './harness';

const SEGMENTS_URL = `/v1/projects/${PROJECT_ID}/segments`;

const segment = (over: Partial<Segment> = {}): Segment => ({
  id: 's1',
  key: 'beta-users',
  name: 'Beta users',
  description: 'Opted in',
  rules: [{ attribute: 'plan', operator: 'in', values: ['pro'] }],
  ...over,
});

const pageHandlers = (
  role: 'admin' | 'developer' | 'viewer' = 'admin',
  over: Handlers = {},
): Handlers => ({
  ...workspaceHandlers(role),
  [`GET ${SEGMENTS_URL}`]: [segment()],
  ...over,
});

function renderPage(handlers: Handlers = pageHandlers()): { stub: FetchStub } {
  stubAuth();
  const stub = stubFetch(handlers);
  renderWithProviders(<SegmentsPage />);
  return { stub };
}

const loaded = () => waitFor(() => expect(screen.getByText('beta-users')).toBeTruthy());

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('listing', () => {
  it('renders key, name, description, and the raw conditions', async () => {
    renderPage();
    await loaded();
    expect(screen.getByText(/Opted in/)).toBeTruthy();
    expect(
      screen.getByText(JSON.stringify([{ attribute: 'plan', operator: 'in', values: ['pro'] }])),
    ).toBeTruthy();
  });

  it('omits the description separator when there is none', async () => {
    renderPage(
      pageHandlers('admin', { [`GET ${SEGMENTS_URL}`]: [segment({ description: null })] }),
    );
    await loaded();
    // Anchored, because the separator is rendered as " - description" and
    // Testing Library trims it to "- description". A bare /-/ also matches the
    // segment key "beta-users", so it can never be null and the assertion was
    // failing for a reason unrelated to the separator.
    expect(screen.queryByText(/^-\s/)).toBeNull();
  });

  it('shows an empty state', async () => {
    renderPage(pageHandlers('admin', { [`GET ${SEGMENTS_URL}`]: [] }));
    await waitFor(() => expect(screen.getByText('No segments yet.')).toBeTruthy());
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

  it('hides all mutation controls from a viewer', async () => {
    renderPage(pageHandlers('viewer'));
    await loaded();
    expect(screen.queryByText('＋ New segment')).toBeNull();
    expect(screen.queryByText('edit')).toBeNull();
    expect(screen.queryByText('delete')).toBeNull();
  });
});

describe('create', () => {
  it('posts a new segment with a trimmed key, name, and parsed conditions', async () => {
    const { stub } = renderPage(
      pageHandlers('admin', { [`POST ${SEGMENTS_URL}`]: segment({ id: 's2' }) }),
    );
    await loaded();

    fireEvent.click(screen.getByText('＋ New segment'));
    expect(screen.getByText('New segment')).toBeTruthy();

    const save = screen.getByText('Save');
    // Both key and name are required for a create.
    expect(save).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: ' power-users ' } });
    expect(save).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' Power users ' } });
    expect(save).toHaveProperty('disabled', false);

    fireEvent.change(screen.getByLabelText('Conditions (ALL must match)'), {
      target: { value: '[{"attribute":"seats","operator":"gte","value":5}]' },
    });
    fireEvent.click(save);

    await waitFor(() => expect(screen.queryByText('New segment')).toBeNull());
    expect(stub.calls.find((c) => c.key === `POST ${SEGMENTS_URL}`)?.body).toEqual({
      key: 'power-users',
      name: 'Power users',
      description: null,
      rules: [{ attribute: 'seats', operator: 'gte', value: 5 }],
    });
  });

  it('pre-fills a sensible starter condition', async () => {
    renderPage();
    await loaded();
    fireEvent.click(screen.getByText('＋ New segment'));
    expect(screen.getByLabelText('Conditions (ALL must match)')).toHaveProperty(
      'value',
      JSON.stringify([{ attribute: 'plan', operator: 'in', values: ['pro'] }], null, 2),
    );
  });

  it('sends a description when one is typed', async () => {
    const { stub } = renderPage(pageHandlers('admin', { [`POST ${SEGMENTS_URL}`]: segment() }));
    await loaded();

    fireEvent.click(screen.getByText('＋ New segment'));
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'k' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'N' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: ' notes ' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() =>
      expect(
        (stub.calls.find((c) => c.key === `POST ${SEGMENTS_URL}`)?.body as { description: string })
          .description,
      ).toBe('notes'),
    );
  });

  it('rejects malformed JSON without calling the API', async () => {
    const { stub } = renderPage();
    await loaded();

    fireEvent.click(screen.getByText('＋ New segment'));
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'k' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'N' } });
    fireEvent.change(screen.getByLabelText('Conditions (ALL must match)'), {
      target: { value: 'not json' },
    });
    fireEvent.click(screen.getByText('Save'));

    expect(screen.getByText('Not valid JSON.')).toBeTruthy();
    expect(stub.calls.some((c) => c.key.startsWith('POST'))).toBe(false);
  });

  it('reports an unknown operator with its path', async () => {
    const { stub } = renderPage();
    await loaded();

    fireEvent.click(screen.getByText('＋ New segment'));
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'k' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'N' } });
    fireEvent.change(screen.getByLabelText('Conditions (ALL must match)'), {
      target: { value: '[{"attribute":"plan","operator":"startsWith","value":"p"}]' },
    });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(document.querySelector('.error-note')).toBeTruthy());
    expect(stub.calls.some((c) => c.key.startsWith('POST'))).toBe(false);
  });

  it('surfaces a rejected create and keeps the modal open', async () => {
    renderPage(
      pageHandlers('admin', {
        [`POST ${SEGMENTS_URL}`]: {
          status: 409,
          body: { error: 'conflict', message: 'key already used' },
        },
      }),
    );
    await loaded();

    fireEvent.click(screen.getByText('＋ New segment'));
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'beta-users' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Dupe' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByText('key already used')).toBeTruthy());
    expect(screen.getByText('New segment')).toBeTruthy();
  });

  it('closes on cancel', async () => {
    renderPage();
    await loaded();
    fireEvent.click(screen.getByText('＋ New segment'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('New segment')).toBeNull();
  });
});

describe('edit', () => {
  it('pre-fills from the segment and PATCHes without the key', async () => {
    const { stub } = renderPage(pageHandlers('admin', { 'PATCH /v1/segments/s1': segment() }));
    await loaded();

    fireEvent.click(screen.getByText('edit'));
    expect(screen.getByText('Edit beta-users')).toBeTruthy();
    // The key is immutable once assigned, so the field is not offered.
    expect(screen.queryByLabelText('Key')).toBeNull();
    expect(screen.getByLabelText('Name')).toHaveProperty('value', 'Beta users');
    expect(screen.getByLabelText('Description')).toHaveProperty('value', 'Opted in');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Beta cohort' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.queryByText('Edit beta-users')).toBeNull());
    expect(stub.calls.find((c) => c.key === 'PATCH /v1/segments/s1')?.body).toEqual({
      name: 'Beta cohort',
      description: 'Opted in',
      rules: [{ attribute: 'plan', operator: 'in', values: ['pro'] }],
    });
  });

  it('clears the description to null when emptied', async () => {
    const { stub } = renderPage(pageHandlers('admin', { 'PATCH /v1/segments/s1': segment() }));
    await loaded();

    fireEvent.click(screen.getByText('edit'));
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: '   ' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() =>
      expect(
        (
          stub.calls.find((c) => c.key === 'PATCH /v1/segments/s1')?.body as {
            description: unknown;
          }
        ).description,
      ).toBeNull(),
    );
  });

  it('handles a segment that arrives with an empty description', async () => {
    renderPage(
      pageHandlers('admin', { [`GET ${SEGMENTS_URL}`]: [segment({ description: null })] }),
    );
    await loaded();
    fireEvent.click(screen.getByText('edit'));
    expect(screen.getByLabelText('Description')).toHaveProperty('value', '');
  });
});

describe('delete', () => {
  it('deletes after confirming', async () => {
    const { stub } = renderPage(
      pageHandlers('admin', { 'DELETE /v1/segments/s1': { status: 204 } }),
    );
    await loaded();

    fireEvent.click(screen.getByText('delete'));
    // Two-step: the first click only arms.
    expect(stub.calls.some((c) => c.key.startsWith('DELETE'))).toBe(false);

    fireEvent.click(screen.getByText('Delete segment?'));
    await waitFor(() =>
      expect(stub.calls.some((c) => c.key === 'DELETE /v1/segments/s1')).toBe(true),
    );
  });

  it('surfaces a delete failure', async () => {
    renderPage(
      pageHandlers('admin', {
        'DELETE /v1/segments/s1': {
          status: 409,
          body: { error: 'in_use', message: 'segment referenced by a rule' },
        },
      }),
    );
    await loaded();

    fireEvent.click(screen.getByText('delete'));
    fireEvent.click(screen.getByText('Delete segment?'));
    await waitFor(() => expect(screen.getByText('segment referenced by a rule')).toBeTruthy());
  });
});
