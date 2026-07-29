// @vitest-environment happy-dom
/**
 * Members: role changes, removal, and the read-only view a non-admin gets
 * (the list is still visible — only the controls are admin-gated).
 */
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Member } from '../src/api/client';
import { MembersPage } from '../src/pages/MembersPage';
import {
  ORG_ID,
  renderWithProviders,
  stubAuth,
  stubFetch,
  workspaceHandlers,
  type FetchStub,
  type Handlers,
} from './harness';

const MEMBERS_URL = `/v1/orgs/${ORG_ID}/members`;

const member = (over: Partial<Member> = {}): Member => ({
  userId: 'u1',
  email: 'dev@velobits.test',
  displayName: 'Dev User',
  role: 'admin',
  createdAt: '2026-07-20T10:00:00.000Z',
  ...over,
});

const MEMBERS: Member[] = [
  member(),
  member({ userId: 'u2', email: 'ops@velobits.test', displayName: null, role: 'viewer' }),
];

const pageHandlers = (
  role: 'admin' | 'developer' | 'viewer' = 'admin',
  over: Handlers = {},
): Handlers => ({
  ...workspaceHandlers(role),
  [`GET ${MEMBERS_URL}`]: MEMBERS,
  ...over,
});

function renderPage(handlers: Handlers = pageHandlers()): { stub: FetchStub } {
  stubAuth();
  const stub = stubFetch(handlers);
  renderWithProviders(<MembersPage />);
  return { stub };
}

const loaded = () => waitFor(() => expect(screen.getByText('ops@velobits.test')).toBeTruthy());

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('listing', () => {
  it('renders names, emails, and an em dash for a missing display name', async () => {
    renderPage();
    await loaded();
    expect(screen.getByText('Dev User')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('surfaces a load failure', async () => {
    renderPage(
      pageHandlers('admin', {
        [`GET ${MEMBERS_URL}`]: { status: 403, body: { error: 'forbidden', message: 'not yours' } },
      }),
    );
    await waitFor(() => expect(screen.getByText('not yours')).toBeTruthy());
  });
});

describe('admin controls', () => {
  it('changes a role', async () => {
    const { stub } = renderPage(
      pageHandlers('admin', { [`PATCH ${MEMBERS_URL}/u2`]: { ok: true } }),
    );
    await loaded();

    fireEvent.change(screen.getByLabelText('Role for ops@velobits.test'), {
      target: { value: 'developer' },
    });
    await waitFor(() =>
      expect(stub.calls.find((c) => c.key === `PATCH ${MEMBERS_URL}/u2`)?.body).toEqual({
        role: 'developer',
      }),
    );
  });

  it('surfaces a rejected role change', async () => {
    renderPage(
      pageHandlers('admin', {
        [`PATCH ${MEMBERS_URL}/u2`]: {
          status: 409,
          body: { error: 'last_admin', message: 'org needs one admin' },
        },
      }),
    );
    await loaded();

    fireEvent.change(screen.getByLabelText('Role for ops@velobits.test'), {
      target: { value: 'admin' },
    });
    await waitFor(() => expect(screen.getByText('org needs one admin')).toBeTruthy());
  });

  it('removes a member after confirming', async () => {
    const { stub } = renderPage(
      pageHandlers('admin', { [`DELETE ${MEMBERS_URL}/u2`]: { status: 204 } }),
    );
    await loaded();

    const [firstRemove] = screen.getAllByText('Remove');
    fireEvent.click(firstRemove!);
    expect(stub.calls.some((c) => c.key.startsWith('DELETE'))).toBe(false);

    fireEvent.click(screen.getByText('Remove from org?'));
    await waitFor(() => expect(stub.calls.some((c) => c.key.startsWith('DELETE'))).toBe(true));
  });

  it('surfaces a failed removal', async () => {
    renderPage(
      pageHandlers('admin', {
        [`DELETE ${MEMBERS_URL}/u1`]: {
          status: 409,
          body: { error: 'last_admin', message: 'cannot remove the last admin' },
        },
      }),
    );
    await loaded();

    const [firstRemove] = screen.getAllByText('Remove');
    fireEvent.click(firstRemove!);
    fireEvent.click(screen.getByText('Remove from org?'));
    await waitFor(() => expect(screen.getByText('cannot remove the last admin')).toBeTruthy());
  });
});

describe('adding a member', () => {
  it('posts email and role, defaulting to developer', async () => {
    const { stub } = renderPage(pageHandlers('admin', { [`POST ${MEMBERS_URL}`]: { ok: true } }));
    await loaded();

    fireEvent.click(screen.getByText('＋ Add member'));
    const submit = screen.getByText('Add');
    expect(submit).toHaveProperty('disabled', true);
    expect(screen.getByLabelText('Role')).toHaveProperty('value', 'developer');

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@velobits.test' } });
    expect(submit).toHaveProperty('disabled', false);
    fireEvent.click(submit);

    await waitFor(() => expect(screen.queryByText('Add member')).toBeNull());
    expect(stub.calls.find((c) => c.key === `POST ${MEMBERS_URL}`)?.body).toEqual({
      email: 'new@velobits.test',
      role: 'developer',
    });
  });

  it('honours a chosen role', async () => {
    const { stub } = renderPage(pageHandlers('admin', { [`POST ${MEMBERS_URL}`]: { ok: true } }));
    await loaded();

    fireEvent.click(screen.getByText('＋ Add member'));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'boss@velobits.test' } });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'admin' } });
    fireEvent.click(screen.getByText('Add'));

    await waitFor(() =>
      expect(
        (stub.calls.find((c) => c.key === `POST ${MEMBERS_URL}`)?.body as { role: string }).role,
      ).toBe('admin'),
    );
  });

  it('surfaces an unknown-user failure and keeps the modal open', async () => {
    renderPage(
      pageHandlers('admin', {
        [`POST ${MEMBERS_URL}`]: {
          status: 404,
          body: { error: 'not_found', message: 'no such user — they must sign in once' },
        },
      }),
    );
    await loaded();

    fireEvent.click(screen.getByText('＋ Add member'));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ghost@velobits.test' } });
    fireEvent.click(screen.getByText('Add'));

    await waitFor(() => expect(screen.getByText(/no such user/)).toBeTruthy());
    expect(screen.getByText('Add member')).toBeTruthy();
  });

  it('closes on cancel', async () => {
    renderPage();
    await loaded();
    fireEvent.click(screen.getByText('＋ Add member'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Add member')).toBeNull();
  });
});

describe('non-admin view', () => {
  it('lists members read-only, with roles as chips', async () => {
    renderPage(pageHandlers('developer'));
    await loaded();

    expect(screen.queryByText('＋ Add member')).toBeNull();
    expect(screen.queryByText('Remove')).toBeNull();
    expect(screen.queryByLabelText('Role for ops@velobits.test')).toBeNull();
    // Roles still readable, just not editable.
    expect(screen.getByText('viewer')).toBeTruthy();
  });
});
