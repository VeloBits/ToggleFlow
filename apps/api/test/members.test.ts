import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  addMember,
  createWorkspace,
  setupTestApp,
  type TestHarness,
  type Workspace,
} from './helpers';

let h: TestHarness;
let ws: Workspace;
let developerToken: string;

beforeAll(async () => {
  h = await setupTestApp();
  ws = await createWorkspace(h);
  await addMember(h.db, ws.orgId, 'dev-user', 'developer');
  developerToken = await h.signToken('dev-user');
  // A user with an account but no membership in ws.orgId yet.
  const outsider = await h.signToken('outsider', { email: 'outsider@example.test' });
  await h.app.inject({ method: 'GET', url: '/v1/me', headers: h.authed(outsider) });
});
afterAll(async () => {
  await h.app.close();
});

const membersUrl = () => `/v1/orgs/${ws.orgId}/members`;

describe('org members', () => {
  it('lists members with email, name, and role', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: membersUrl(),
      headers: h.authed(ws.adminToken),
    });
    expect(res.statusCode).toBe(200);
    const roles = res.json().map((m: { role: string }) => m.role);
    expect(roles).toContain('admin');
    expect(roles).toContain('developer');
  });

  it('adds an existing account by email (admin only) and audits it', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: membersUrl(),
      headers: h.authed(ws.adminToken),
      payload: { email: 'outsider@example.test', role: 'viewer' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ email: 'outsider@example.test', role: 'viewer' });

    const audit = await h.app.inject({
      method: 'GET',
      url: `/v1/orgs/${ws.orgId}/audit`,
      headers: h.authed(ws.adminToken),
    });
    expect(audit.json().entries[0].action).toBe('member.add');
  });

  it('rejects unknown emails and duplicate memberships', async () => {
    const unknown = await h.app.inject({
      method: 'POST',
      url: membersUrl(),
      headers: h.authed(ws.adminToken),
      payload: { email: 'ghost@example.test', role: 'viewer' },
    });
    expect(unknown.statusCode).toBe(404);

    const duplicate = await h.app.inject({
      method: 'POST',
      url: membersUrl(),
      headers: h.authed(ws.adminToken),
      payload: { email: 'outsider@example.test', role: 'viewer' },
    });
    expect(duplicate.statusCode).toBe(409);
  });

  it('changes roles and removes members', async () => {
    const list = await h.app.inject({
      method: 'GET',
      url: membersUrl(),
      headers: h.authed(ws.adminToken),
    });
    const outsider = list
      .json()
      .find((m: { email: string }) => m.email === 'outsider@example.test');

    const patched = await h.app.inject({
      method: 'PATCH',
      url: `${membersUrl()}/${outsider.userId}`,
      headers: h.authed(ws.adminToken),
      payload: { role: 'developer' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().role).toBe('developer');

    const removed = await h.app.inject({
      method: 'DELETE',
      url: `${membersUrl()}/${outsider.userId}`,
      headers: h.authed(ws.adminToken),
    });
    expect(removed.statusCode).toBe(204);
  });

  it('never lets the last admin demote or remove themselves', async () => {
    const list = await h.app.inject({
      method: 'GET',
      url: membersUrl(),
      headers: h.authed(ws.adminToken),
    });
    const admin = list.json().find((m: { role: string }) => m.role === 'admin');

    const demote = await h.app.inject({
      method: 'PATCH',
      url: `${membersUrl()}/${admin.userId}`,
      headers: h.authed(ws.adminToken),
      payload: { role: 'viewer' },
    });
    expect(demote.statusCode).toBe(400);
    expect(demote.json().error).toBe('last_admin');

    const remove = await h.app.inject({
      method: 'DELETE',
      url: `${membersUrl()}/${admin.userId}`,
      headers: h.authed(ws.adminToken),
    });
    expect(remove.statusCode).toBe(400);
  });

  it('requires the admin role for mutations', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: membersUrl(),
      headers: h.authed(developerToken),
      payload: { email: 'outsider@example.test', role: 'viewer' },
    });
    expect(res.statusCode).toBe(403);
  });
});
