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
let prodEnvId: string;

beforeAll(async () => {
  h = await setupTestApp();
  ws = await createWorkspace(h);
  await addMember(h.db, ws.orgId, 'dev-user', 'developer');
  await addMember(h.db, ws.orgId, 'viewer-user', 'viewer');
  developerToken = await h.signToken('dev-user');
  viewerToken = await h.signToken('viewer-user');
  prodEnvId = ws.environments.find((e) => e.key === 'prod')!.id;

  const tool = await h.app.inject({
    method: 'POST',
    url: `/v1/projects/${ws.projectId}/tools`,
    headers: h.authed(developerToken),
    payload: { key: 'tool.flip', name: 'Flip Me' },
  });
  toolId = tool.json().id;
});
afterAll(async () => {
  await h.app.close();
});

describe('flag state', () => {
  const flagUrl = () => `/v1/environments/${prodEnvId}/tools/${toolId}/flag`;

  it('flips the kill switch and audits before/after', async () => {
    const res = await h.app.inject({
      method: 'PATCH',
      url: flagUrl(),
      headers: h.authed(developerToken),
      payload: { enabled: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().enabled).toBe(true);

    const audit = await h.app.inject({
      method: 'GET',
      url: `/v1/orgs/${ws.orgId}/audit`,
      headers: h.authed(ws.adminToken),
    });
    const entry = audit.json().entries.find((e: { action: string }) => e.action === 'flag.update');
    expect(entry.before.enabled).toBe(false);
    expect(entry.after.enabled).toBe(true);
  });

  it('sets rollout percent and targeting rules validated by the engine schema', async () => {
    const res = await h.app.inject({
      method: 'PATCH',
      url: flagUrl(),
      headers: h.authed(developerToken),
      payload: {
        rolloutPercent: 25,
        targetingRules: [
          {
            segments: ['beta-users'],
            conditions: [{ attribute: 'plan', operator: 'in', values: ['pro'] }],
            enabled: true,
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().rolloutPercent).toBe(25);
    expect(res.json().targetingRules).toHaveLength(1);
  });

  it('rejects out-of-range rollout and malformed rules', async () => {
    const badPercent = await h.app.inject({
      method: 'PATCH',
      url: flagUrl(),
      headers: h.authed(developerToken),
      payload: { rolloutPercent: 150 },
    });
    expect(badPercent.statusCode).toBe(400);

    const badRule = await h.app.inject({
      method: 'PATCH',
      url: flagUrl(),
      headers: h.authed(developerToken),
      payload: {
        targetingRules: [
          { conditions: [{ attribute: 'plan', operator: 'matches', value: 'x' }], enabled: true },
        ],
      },
    });
    expect(badRule.statusCode).toBe(400);

    const empty = await h.app.inject({
      method: 'PATCH',
      url: flagUrl(),
      headers: h.authed(developerToken),
      payload: {},
    });
    expect(empty.statusCode).toBe(400);
  });

  it('404s when the tool does not belong to the environment project', async () => {
    const otherWs = await createWorkspace(h, 'flags-other');
    const otherTool = await h.app.inject({
      method: 'POST',
      url: `/v1/projects/${otherWs.projectId}/tools`,
      headers: h.authed(otherWs.adminToken),
      payload: { key: 'tool.foreign', name: 'Foreign' },
    });
    // Cross-org: developer of ws cannot even see the foreign tool.
    const res = await h.app.inject({
      method: 'PATCH',
      url: `/v1/environments/${prodEnvId}/tools/${otherTool.json().id}/flag`,
      headers: h.authed(developerToken),
      payload: { enabled: true },
    });
    expect(res.statusCode).toBe(404);
  });

  it('keeps viewers read-only', async () => {
    const res = await h.app.inject({
      method: 'PATCH',
      url: flagUrl(),
      headers: h.authed(viewerToken),
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(403);

    const list = await h.app.inject({
      method: 'GET',
      url: `/v1/environments/${prodEnvId}/flags`,
      headers: h.authed(viewerToken),
    });
    expect(list.statusCode).toBe(200);
    const row = list.json().find((f: { toolKey: string }) => f.toolKey === 'tool.flip');
    expect(row.enabled).toBe(true);
    expect(row.rolloutPercent).toBe(25);
  });
});
