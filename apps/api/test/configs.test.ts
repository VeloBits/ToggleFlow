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
let viewerToken: string;
let toolId: string;
let envId: string;

const configUrl = () => `/v1/environments/${envId}/tools/${toolId}/config`;

beforeAll(async () => {
  h = await setupTestApp();
  ws = await createWorkspace(h);
  await addMember(h.db, ws.orgId, 'dev-user', 'developer');
  await addMember(h.db, ws.orgId, 'viewer-user', 'viewer');
  developerToken = await h.signToken('dev-user');
  viewerToken = await h.signToken('viewer-user');
  envId = ws.environments.find((e) => e.key === 'prod')!.id;

  const tool = await h.app.inject({
    method: 'POST',
    url: `/v1/projects/${ws.projectId}/tools`,
    headers: h.authed(developerToken),
    payload: { key: 'tool.configured', name: 'Configured' },
  });
  toolId = tool.json().id;
});
afterAll(async () => {
  await h.app.close();
});

describe('versioned config', () => {
  it('reads as empty (version 0) before any edit', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: configUrl(),
      headers: h.authed(viewerToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ value: null, version: 0 });
  });

  it('appends a new version on every edit', async () => {
    const v1 = await h.app.inject({
      method: 'PUT',
      url: configUrl(),
      headers: h.authed(developerToken),
      payload: { value: { limit: 10, fallback: { mode: 'hide' } } },
    });
    expect(v1.statusCode).toBe(200);
    expect(v1.json().version).toBe(1);

    const v2 = await h.app.inject({
      method: 'PUT',
      url: configUrl(),
      headers: h.authed(developerToken),
      payload: { value: { limit: 20, fallback: { mode: 'hide' } } },
    });
    expect(v2.json().version).toBe(2);

    const versions = await h.app.inject({
      method: 'GET',
      url: `${configUrl()}/versions`,
      headers: h.authed(viewerToken),
    });
    const list = versions.json();
    expect(list.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(list[0].authorId).toBeTruthy();
  });

  it('rolls back by creating a NEW version copying the old one', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: `${configUrl()}/rollback`,
      headers: h.authed(developerToken),
      payload: { toVersion: 1 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().version).toBe(3);
    expect(res.json().value).toEqual({ limit: 10, fallback: { mode: 'hide' } });

    const versions = await h.app.inject({
      method: 'GET',
      url: `${configUrl()}/versions`,
      headers: h.authed(viewerToken),
    });
    const latest = versions.json()[0];
    expect(latest.version).toBe(3);
    expect(latest.restoredFromVersion).toBe(1);

    const current = await h.app.inject({
      method: 'GET',
      url: configUrl(),
      headers: h.authed(viewerToken),
    });
    expect(current.json().value.limit).toBe(10);
  });

  it('rejects rollback to a missing or current version', async () => {
    const missing = await h.app.inject({
      method: 'POST',
      url: `${configUrl()}/rollback`,
      headers: h.authed(developerToken),
      payload: { toVersion: 99 },
    });
    expect(missing.statusCode).toBe(404);

    const same = await h.app.inject({
      method: 'POST',
      url: `${configUrl()}/rollback`,
      headers: h.authed(developerToken),
      payload: { toVersion: 3 },
    });
    expect(same.statusCode).toBe(400);
  });

  it('audits config edits and rollbacks', async () => {
    const audit = await h.app.inject({
      method: 'GET',
      url: `/v1/orgs/${ws.orgId}/audit?limit=200`,
      headers: h.authed(ws.adminToken),
    });
    const actions = audit.json().entries.map((e: { action: string }) => e.action);
    expect(actions.filter((a: string) => a === 'config.update')).toHaveLength(2);
    expect(actions).toContain('config.rollback');
  });

  it('keeps viewers read-only', async () => {
    const res = await h.app.inject({
      method: 'PUT',
      url: configUrl(),
      headers: h.authed(viewerToken),
      payload: { value: { limit: 1 } },
    });
    expect(res.statusCode).toBe(403);
  });
});
