import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { apiKeys } from '../src/db/schema';
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
let envId: string;

beforeAll(async () => {
  h = await setupTestApp();
  ws = await createWorkspace(h);
  await addMember(h.db, ws.orgId, 'dev-user', 'developer');
  developerToken = await h.signToken('dev-user');
  envId = ws.environments.find((e) => e.key === 'prod')!.id;
});
afterAll(async () => {
  await h.app.close();
});

describe('API keys', () => {
  let keyId: string;
  let token: string;

  it('issues a key, revealing the full token exactly once', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: `/v1/environments/${envId}/keys`,
      headers: h.authed(ws.adminToken),
      payload: { name: 'prod server key', kind: 'server' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    keyId = body.id;
    token = body.token;
    expect(token).toMatch(/^tf_srv_/);
    expect(token.startsWith(body.prefix)).toBe(true);
    expect(body).not.toHaveProperty('keyHash');

    // Stored form is prefix + hash only — never the token.
    const [row] = await h.db.select().from(apiKeys).where(eq(apiKeys.id, keyId));
    expect(row!.keyHash).not.toBe(token);
    expect(row!.keyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('lists keys without any secret material', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: `/v1/environments/${envId}/keys`,
      headers: h.authed(ws.adminToken),
    });
    expect(res.statusCode).toBe(200);
    const [entry] = res.json();
    expect(entry.prefix).toBeTruthy();
    expect(entry).not.toHaveProperty('token');
    expect(entry).not.toHaveProperty('keyHash');
  });

  it('revokes a key (idempotently) and audits both actions', async () => {
    const res = await h.app.inject({
      method: 'DELETE',
      url: `/v1/api-keys/${keyId}`,
      headers: h.authed(ws.adminToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().revokedAt).toBeTruthy();

    const again = await h.app.inject({
      method: 'DELETE',
      url: `/v1/api-keys/${keyId}`,
      headers: h.authed(ws.adminToken),
    });
    expect(again.statusCode).toBe(200);

    const audit = await h.app.inject({
      method: 'GET',
      url: `/v1/orgs/${ws.orgId}/audit`,
      headers: h.authed(ws.adminToken),
    });
    const actions = audit.json().entries.map((e: { action: string }) => e.action);
    expect(actions).toContain('api_key.create');
    expect(actions.filter((a: string) => a === 'api_key.revoke')).toHaveLength(1);
  });

  it('requires the admin role for key management', async () => {
    const create = await h.app.inject({
      method: 'POST',
      url: `/v1/environments/${envId}/keys`,
      headers: h.authed(developerToken),
      payload: { name: 'nope', kind: 'client' },
    });
    expect(create.statusCode).toBe(403);

    const list = await h.app.inject({
      method: 'GET',
      url: `/v1/environments/${envId}/keys`,
      headers: h.authed(developerToken),
    });
    expect(list.statusCode).toBe(403);
  });
});
