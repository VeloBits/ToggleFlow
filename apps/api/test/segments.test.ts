/**
 * Reusable segments: CRUD, key/rule validation, RBAC, audit trail, and the
 * fan-out that republishes every environment in the project on each mutation
 * (a segment is referenced by rulesets, so editing one changes what the
 * delivery plane must serve).
 */
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { segments } from '../src/db/schema';
import {
  addMember,
  createWorkspace,
  setupTestApp,
  type TestHarness,
  type Workspace,
} from './helpers';

let h: TestHarness;
let ws: Workspace;
let viewerToken: string;
let outsiderToken: string;

beforeAll(async () => {
  h = await setupTestApp();
  ws = await createWorkspace(h);
  await addMember(h.db, ws.orgId, 'seg-viewer', 'viewer');
  viewerToken = await h.signToken('seg-viewer');
  // First login bootstraps its OWN org, so this caller is a legitimate user
  // who simply has no membership in ws.orgId.
  const outsider = await h.signToken('seg-outsider');
  await h.app.inject({ method: 'GET', url: '/v1/me', headers: h.authed(outsider) });
  outsiderToken = outsider;
});
afterAll(async () => {
  await h.app.close();
});

// `unknown` here would push inject() onto its chainable overload, losing
// statusCode/json on the result.
const create = (payload: Record<string, unknown>, token = ws.adminToken) =>
  h.app.inject({
    method: 'POST',
    url: `/v1/projects/${ws.projectId}/segments`,
    headers: h.authed(token),
    payload,
  });

describe('segments CRUD', () => {
  let segmentId: string;

  it('creates a segment with rules and returns it', async () => {
    const res = await create({
      key: 'beta-testers',
      name: 'Beta testers',
      description: 'Opted into the beta',
      rules: [
        { attribute: 'plan', operator: 'in', values: ['pro', 'team'] },
        { attribute: 'seats', operator: 'gte', value: 5 },
      ],
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    segmentId = body.id;
    expect(body.key).toBe('beta-testers');
    expect(body.description).toBe('Opted into the beta');
    expect(body.rules).toHaveLength(2);
  });

  it('defaults rules to an empty array and description to null', async () => {
    const res = await create({ key: 'everyone', name: 'Everyone' });
    expect(res.statusCode).toBe(201);
    expect(res.json().rules).toEqual([]);
    expect(res.json().description).toBeNull();
  });

  it("lists a project's segments ordered by key", async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: `/v1/projects/${ws.projectId}/segments`,
      headers: h.authed(viewerToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().map((s: { key: string }) => s.key)).toEqual(['beta-testers', 'everyone']);
  });

  it('patches a subset of fields, leaving the rest intact', async () => {
    const res = await h.app.inject({
      method: 'PATCH',
      url: `/v1/segments/${segmentId}`,
      headers: h.authed(ws.adminToken),
      payload: { name: 'Beta cohort' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Beta cohort');
    // Untouched by a name-only patch.
    expect(res.json().rules).toHaveLength(2);
    expect(res.json().description).toBe('Opted into the beta');
  });

  it('replaces rules and clears description via an explicit null', async () => {
    const res = await h.app.inject({
      method: 'PATCH',
      url: `/v1/segments/${segmentId}`,
      headers: h.authed(ws.adminToken),
      payload: {
        description: null,
        rules: [{ attribute: 'country', operator: 'eq', value: 'NL' }],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().description).toBeNull();
    expect(res.json().rules).toEqual([{ attribute: 'country', operator: 'eq', value: 'NL' }]);
  });

  it('deletes a segment and stops listing it', async () => {
    const res = await h.app.inject({
      method: 'DELETE',
      url: `/v1/segments/${segmentId}`,
      headers: h.authed(ws.adminToken),
    });
    expect(res.statusCode).toBe(204);

    const [row] = await h.db.select().from(segments).where(eq(segments.id, segmentId));
    expect(row).toBeUndefined();
  });

  it('records create, update, and delete in the audit log', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: `/v1/orgs/${ws.orgId}/audit`,
      headers: h.authed(ws.adminToken),
    });
    const actions = res.json().entries.map((e: { action: string }) => e.action);
    expect(actions).toContain('segment.create');
    expect(actions).toContain('segment.update');
    expect(actions).toContain('segment.delete');
  });
});

describe('segments validation', () => {
  it.each([
    ['uppercase', 'Beta'],
    ['leading dash', '-beta'],
    ['spaces', 'beta testers'],
    ['empty', ''],
  ])('rejects a %s key', async (_label, key) => {
    expect((await create({ key, name: 'x' })).statusCode).toBe(400);
  });

  it('accepts dots, dashes, underscores, and digits', async () => {
    const res = await create({ key: 'eu.beta_2-x', name: 'Mixed' });
    expect(res.statusCode).toBe(201);
  });

  it('rejects an unknown operator', async () => {
    const res = await create({
      key: 'bad-op',
      name: 'Bad op',
      rules: [{ attribute: 'plan', operator: 'startsWith', value: 'p' }],
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a numeric comparison against a non-number', async () => {
    const res = await create({
      key: 'bad-gt',
      name: 'Bad gt',
      rules: [{ attribute: 'seats', operator: 'gt', value: 'five' }],
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an empty patch body', async () => {
    const made = await create({ key: 'patchable', name: 'Patchable' });
    const res = await h.app.inject({
      method: 'PATCH',
      url: `/v1/segments/${made.json().id}`,
      headers: h.authed(ws.adminToken),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a non-uuid segment id', async () => {
    const res = await h.app.inject({
      method: 'DELETE',
      url: '/v1/segments/not-a-uuid',
      headers: h.authed(ws.adminToken),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a duplicate key within one project', async () => {
    await create({ key: 'dupe', name: 'First' });
    const res = await create({ key: 'dupe', name: 'Second' });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});

describe('segments RBAC', () => {
  it('lets a viewer read but not write', async () => {
    const list = await h.app.inject({
      method: 'GET',
      url: `/v1/projects/${ws.projectId}/segments`,
      headers: h.authed(viewerToken),
    });
    expect(list.statusCode).toBe(200);
    expect((await create({ key: 'viewer-made', name: 'Nope' }, viewerToken)).statusCode).toBe(403);
  });

  it("hides another org's project behind a 404, not a 403", async () => {
    expect((await create({ key: 'x', name: 'x' }, outsiderToken)).statusCode).toBe(404);
  });

  it('404s an unknown segment id', async () => {
    const res = await h.app.inject({
      method: 'PATCH',
      url: '/v1/segments/00000000-0000-4000-8000-000000000000',
      headers: h.authed(ws.adminToken),
      payload: { name: 'ghost' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: `/v1/projects/${ws.projectId}/segments`,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('segment mutations republish every environment in the project', () => {
  it('schedules a ruleset publish per environment on create, patch, and delete', async () => {
    const spy = vi.spyOn(h.app.publisher, 'scheduleRuleset');
    // createWorkspace seeds the default environment set; every one of them must
    // be republished, not just the one being looked at.
    const envIds = ws.environments.map((e) => e.id).sort();
    const scheduled = () => spy.mock.calls.map(([envId]) => envId).sort();

    try {
      const made = await create({ key: 'fanout', name: 'Fan out' });
      expect(made.statusCode).toBe(201);
      expect(scheduled()).toEqual(envIds);

      spy.mockClear();
      await h.app.inject({
        method: 'PATCH',
        url: `/v1/segments/${made.json().id}`,
        headers: h.authed(ws.adminToken),
        payload: { name: 'Fan out again' },
      });
      expect(scheduled()).toEqual(envIds);

      spy.mockClear();
      await h.app.inject({
        method: 'DELETE',
        url: `/v1/segments/${made.json().id}`,
        headers: h.authed(ws.adminToken),
      });
      expect(scheduled()).toEqual(envIds);
    } finally {
      spy.mockRestore();
    }
  });
});
