// @vitest-environment happy-dom
/** Project-scoped search over flags and segments. */
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Segment } from '../src/api/client';
import { SearchPage } from '../src/pages/SearchPage';
import {
  ENV_ID,
  PROJECT_ID,
  flagDefinition,
  flagRow,
  renderWithProviders,
  stubAuth,
  stubFetch,
  workspaceHandlers,
  type Handlers,
} from './harness';

const segment = (over: Partial<Segment> = {}): Segment => ({
  id: 's1',
  key: 'beta-users',
  name: 'Beta users',
  description: 'Opted in',
  rules: [],
  ...over,
});

const pageHandlers = (over: Handlers = {}): Handlers => ({
  ...workspaceHandlers(),
  [`GET /v1/environments/${ENV_ID}/flags`]: [
    flagRow(),
    flagRow({ id: 't2', key: 'checkout.v2', name: 'Checkout' }),
  ],
  [`GET /v1/projects/${PROJECT_ID}/tools?includeArchived=true`]: [flagDefinition({ tags: ['ai'] })],
  [`GET /v1/projects/${PROJECT_ID}/segments`]: [segment()],
  ...over,
});

function renderPage(handlers: Handlers = pageHandlers()) {
  stubAuth();
  const stub = stubFetch(handlers);
  renderWithProviders(<SearchPage />);
  return { stub };
}

const field = () => screen.getByLabelText('Search flags and segments');
const type = (value: string) => fireEvent.change(field(), { target: { value } });

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('search', () => {
  it('shows a prompt before anything is typed', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Start typing')).toBeTruthy());
  });

  it('matches flags on key and name', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Start typing')).toBeTruthy());

    type('checkout');
    await waitFor(() => expect(screen.getByText('checkout.v2')).toBeTruthy());
    expect(screen.getByText('Flags · 1')).toBeTruthy();
    expect(screen.queryByText('tool.summarize')).toBeNull();
  });

  it('matches flags on a tag', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Start typing')).toBeTruthy());
    type('ai');
    await waitFor(() => expect(screen.getByText('tool.summarize')).toBeTruthy());
  });

  it('matches segments on key, name and description', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Start typing')).toBeTruthy());
    type('opted');
    await waitFor(() => expect(screen.getByText('Segments · 1')).toBeTruthy());
    expect(screen.getByText('beta-users')).toBeTruthy();
  });

  it('reports a miss without pretending to have results', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Start typing')).toBeTruthy());
    type('zzzz');
    await waitFor(() => expect(screen.getByText(/Nothing matches “zzzz”/)).toBeTruthy());
  });

  it('names the scope it is searching', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('Flags and segments in Control Plane · Production.')).toBeTruthy(),
    );
  });
});
