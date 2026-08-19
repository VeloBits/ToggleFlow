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
      // One AND-group of two conditions. `rules` is a list of GROUPS.
      rules: [
        [
          { attribute: 'plan', operator: 'in', values: ['pro', 'team'] },
          { attribute: 'seats', operator: 'gte', value: 5 },
        ],
      ],
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    segmentId = body.id;
    expect(body.key).toBe('beta-testers');
    expect(body.description).toBe('Opted into the beta');
    expect(body.rules).toHaveLength(1);
    expect(body.rules[0]).toHaveLength(2);
    expect(body.match).toBe('all');
  });

  it('defaults rules to one empty group, match to all, and description to null', async () => {
    const res = await create({ key: 'everyone', name: 'Everyone' });
    expect(res.statusCode).toBe(201);
    // One empty group, not zero groups: the column's invariant is "always a
    // group", and an empty group still matches everyone.
    expect(res.json().rules).toEqual([[]]);
    expect(res.json().match).toBe('all');
    expect(res.json().description).toBeNull();
  });

  it('creates an ORed segment', async () => {
    const res = await create({
      key: 'or-cohort',
      name: 'OR cohort',
      match: 'any',
      rules: [
        [{ attribute: 'plan', operator: 'eq', value: 'pro' }],
        [{ attribute: 'country', operator: 'eq', value: 'us' }],
      ],
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().match).toBe('any');
    expect(res.json().rules).toHaveLength(2);
  });

  it('rejects zero groups', async () => {
    // `[]` would mean two different things depending on match - `every` of
    // nothing is true, `some` of nothing is false - so it is not a legal input.
    const res = await create({ key: 'no-groups', name: 'No groups', rules: [] });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a flat condition list', async () => {
    // The pre-OR shape. Rejected rather than coerced: silently wrapping would
    // let a stale client keep writing and hide that it needs updating.
    const res = await create({
      key: 'flat',
      name: 'Flat',
      rules: [{ attribute: 'plan', operator: 'eq', value: 'pro' }],
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an unknown match mode', async () => {
    const res = await create({ key: 'bad-match', name: 'Bad match', match: 'either' });
    expect(res.statusCode).toBe(400);
  });

  it("lists a project's segments ordered by key", async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: `/v1/projects/${ws.projectId}/segments`,
      headers: h.authed(viewerToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().map((s: { key: string }) => s.key)).toEqual([
      'beta-testers',
      'everyone',
      'or-cohort',
    ]);
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
    expect(res.json().rules[0]).toHaveLength(2);
    expect(res.json().description).toBe('Opted into the beta');
  });

  it('replaces rules and clears description via an explicit null', async () => {
    const res = await h.app.inject({
      method: 'PATCH',
      url: `/v1/segments/${segmentId}`,
      headers: h.authed(ws.adminToken),
      payload: {
        description: null,
        rules: [[{ attribute: 'country', operator: 'eq', value: 'NL' }]],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().description).toBeNull();
    expect(res.json().rules).toEqual([[{ attribute: 'country', operator: 'eq', value: 'NL' }]]);
  });

  it('patches match on its own', async () => {
    const res = await h.app.inject({
      method: 'PATCH',
      url: `/v1/segments/${segmentId}`,
      headers: h.authed(ws.adminToken),
      payload: { match: 'any' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().match).toBe('any');
    expect(res.json().rules).toHaveLength(1);
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
      rules: [[{ attribute: 'plan', operator: 'startsWith', value: 'p' }]],
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a numeric comparison against a non-number', async () => {
    const res = await create({
      key: 'bad-gt',
      name: 'Bad gt',
      rules: [[{ attribute: 'seats', operator: 'gt', value: 'five' }]],
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a condition nested one level too deep', async () => {
    const res = await create({
      key: 'too-deep',
      name: 'Too deep',
      rules: [[[{ attribute: 'plan', operator: 'eq', value: 'pro' }]]],
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

describe('segment usage', () => {
  /*
   * A whole-project map keyed by segment KEY, because that is what a targeting
   * rule stores. The list page reads a count per row and the detail page reads
   * the references for one, from the same response.
   */
  const usage = (token = ws.adminToken) =>
    h.app.inject({
      method: 'GET',
      url: `/v1/projects/${ws.projectId}/segments/usage`,
      headers: h.authed(token),
    });

  let envId: string;
  let flagId: string;

  beforeAll(async () => {
    envId = ws.environments[0]!.id;
    const tool = await h.app.inject({
      method: 'POST',
      url: `/v1/projects/${ws.projectId}/tools`,
      headers: h.authed(ws.adminToken),
      payload: { key: 'tool.usage', name: 'Usage' },
    });
    flagId = tool.json().id;
  });

  it('reports nothing before any flag references a segment', async () => {
    const res = await usage();
    expect(res.statusCode).toBe(200);
    expect(res.json()['beta-testers']).toBeUndefined();
  });

  it('reports the referencing flag and environment', async () => {
    await create({ key: 'used-seg', name: 'Used' });
    const patch = await h.app.inject({
      method: 'PATCH',
      url: `/v1/environments/${envId}/tools/${flagId}/flag`,
      headers: h.authed(ws.adminToken),
      payload: { targetingRules: [{ segments: ['used-seg'], enabled: true }] },
    });
    expect(patch.statusCode).toBe(200);

    const entry = (await usage()).json()['used-seg'];
    expect(entry.flagCount).toBe(1);
    expect(entry.references).toHaveLength(1);
    expect(entry.references[0]).toMatchObject({
      flagId,
      flagKey: 'tool.usage',
      environmentId: envId,
    });
  });

  it('counts a flag once even when two of its rules name the same segment', async () => {
    await h.app.inject({
      method: 'PATCH',
      url: `/v1/environments/${envId}/tools/${flagId}/flag`,
      headers: h.authed(ws.adminToken),
      payload: {
        targetingRules: [
          { segments: ['used-seg'], enabled: true },
          { segments: ['used-seg'], enabled: false },
        ],
      },
    });
    expect((await usage()).json()['used-seg'].flagCount).toBe(1);
  });

  it('reports a dangling reference to a segment that does not exist', async () => {
    // The engine treats an unknown segment key as never matching; surfacing it
    // beats dropping it, since a rule pointing at nothing is worth seeing.
    await h.app.inject({
      method: 'PATCH',
      url: `/v1/environments/${envId}/tools/${flagId}/flag`,
      headers: h.authed(ws.adminToken),
      payload: { targetingRules: [{ segments: ['ghost-seg'], enabled: true }] },
    });
    expect((await usage()).json()['ghost-seg'].flagCount).toBe(1);
  });

  it('is readable by a viewer and hidden from an outsider', async () => {
    expect((await usage(viewerToken)).statusCode).toBe(200);
    expect((await usage(outsiderToken)).statusCode).toBe(404);
  });
});

describe('project attributes', () => {
  it('derives attributes and value samples from segments and flag rules', async () => {
    await create({
      key: 'attr-source',
      name: 'Attr source',
      rules: [
        [
          { attribute: 'plan', operator: 'in', values: ['pro', 'team'] },
          { attribute: 'seats', operator: 'gte', value: 5 },
        ],
      ],
    });

    const res = await h.app.inject({
      method: 'GET',
      url: `/v1/projects/${ws.projectId}/attributes`,
      headers: h.authed(viewerToken),
    });
    expect(res.statusCode).toBe(200);

    const byName = new Map(
      res.json().map((a: { name: string; valueSamples: unknown[] }) => [a.name, a.valueSamples]),
    );
    expect(byName.get('plan')).toEqual(expect.arrayContaining(['pro', 'team']));
    expect(byName.get('seats')).toEqual([5]);
  });

  it('hides another org behind a 404', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: `/v1/projects/${ws.projectId}/attributes`,
      headers: h.authed(outsiderToken),
    });
    expect(res.statusCode).toBe(404);
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
