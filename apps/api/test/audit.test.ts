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

beforeAll(async () => {
  h = await setupTestApp();
  ws = await createWorkspace(h);
  // Generate a few mutations to read back.
  for (let i = 1; i <= 3; i++) {
    await h.app.inject({
      method: 'POST',
      url: `/v1/projects/${ws.projectId}/tools`,
      headers: h.authed(ws.adminToken),
      payload: { key: `tool.audit-${i}`, name: `Audit ${i}` },
    });
  }
});
afterAll(async () => {
  await h.app.close();
});

describe('audit log', () => {
  it('returns entries newest-first with actor and action', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: `/v1/orgs/${ws.orgId}/audit`,
      headers: h.authed(ws.adminToken),
    });
    expect(res.statusCode).toBe(200);
    const { entries } = res.json();
    expect(entries.length).toBeGreaterThanOrEqual(5); // bootstrap + project + 3 tools
    expect(entries[0].action).toBe('tool.create');
    expect(entries[0].actorId).toBeTruthy();
    const timestamps = entries.map((e: { createdAt: string }) => e.createdAt);
    expect([...timestamps].sort().reverse()).toEqual(timestamps);
  });

  it('honors the limit and before-cursor parameters', async () => {
    const first = await h.app.inject({
      method: 'GET',
      url: `/v1/orgs/${ws.orgId}/audit?limit=2`,
      headers: h.authed(ws.adminToken),
    });
    expect(first.json().entries).toHaveLength(2);

    const cursor = first.json().entries[1].createdAt;
    const next = await h.app.inject({
      method: 'GET',
      url: `/v1/orgs/${ws.orgId}/audit?limit=2&before=${encodeURIComponent(cursor)}`,
      headers: h.authed(ws.adminToken),
    });
    expect(next.statusCode).toBe(200);
    for (const entry of next.json().entries) {
      expect(new Date(entry.createdAt).getTime()).toBeLessThan(new Date(cursor).getTime());
    }
  });

  it('is readable by viewers but hidden from non-members', async () => {
    await addMember(h.db, ws.orgId, 'viewer-user', 'viewer');
    const viewer = await h.signToken('viewer-user');
    const ok = await h.app.inject({
      method: 'GET',
      url: `/v1/orgs/${ws.orgId}/audit`,
      headers: h.authed(viewer),
    });
    expect(ok.statusCode).toBe(200);

    const stranger = await h.signToken('audit-stranger');
    const hidden = await h.app.inject({
      method: 'GET',
      url: `/v1/orgs/${ws.orgId}/audit`,
      headers: h.authed(stranger),
    });
    expect(hidden.statusCode).toBe(404);
  });
});
