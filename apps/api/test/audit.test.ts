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

  it('narrows to one entity with entityId', async () => {
    /*
     * The detail-page activity panel. Filtered in SQL rather than in the client
     * because the feed is paged newest-first: in a busy org an entity's events
     * sit well past the first page, so filtering what arrived would show an empty
     * history for something that has plenty.
     */
    const made = await h.app.inject({
      method: 'POST',
      url: `/v1/projects/${ws.projectId}/segments`,
      headers: h.authed(ws.adminToken),
      payload: { key: 'audited-seg', name: 'Audited' },
    });
    const segmentId = made.json().id;
    await h.app.inject({
      method: 'PATCH',
      url: `/v1/segments/${segmentId}`,
      headers: h.authed(ws.adminToken),
      payload: { name: 'Audited again' },
    });

    const res = await h.app.inject({
      method: 'GET',
      url: `/v1/orgs/${ws.orgId}/audit?entityId=${segmentId}`,
      headers: h.authed(ws.adminToken),
    });
    expect(res.statusCode).toBe(200);
    const { entries } = res.json();
    expect(entries.map((e: { action: string }) => e.action)).toEqual([
      'segment.update',
      'segment.create',
    ]);
    // Nothing from the tools created in beforeAll leaks in.
    expect(entries.every((e: { entityId: string }) => e.entityId === segmentId)).toBe(true);
  });

  it('returns an empty list for an entity with no history', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: `/v1/orgs/${ws.orgId}/audit?entityId=00000000-0000-4000-8000-000000000000`,
      headers: h.authed(ws.adminToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().entries).toEqual([]);
  });

  it('rejects a non-uuid entityId', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: `/v1/orgs/${ws.orgId}/audit?entityId=not-a-uuid`,
      headers: h.authed(ws.adminToken),
    });
    expect(res.statusCode).toBe(400);
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
