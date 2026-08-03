/**
 * Creating an environment that inherits another's configuration.
 *
 * The fixture builds a Production environment with a deliberately awkward mix -
 * one flag on with targeting, one mid-rollout, one off, one with config and one
 * without - so a copy that only handles the simple cases fails here.
 */
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
let prodEnvId: string;
let developerToken: string;
/** key -> toolId */
const toolIds = new Map<string, string>();

const authed = () => h.authed(ws.adminToken);

async function createEnvironment(payload: Record<string, unknown>, token = ws.adminToken) {
  return h.app.inject({
    method: 'POST',
    url: `/v1/projects/${ws.projectId}/environments`,
    headers: h.authed(token),
    payload,
  });
}

const flagsIn = async (environmentId: string) => {
  const res = await h.app.inject({
    method: 'GET',
    url: `/v1/environments/${environmentId}/flags`,
    headers: authed(),
  });
  const byKey = new Map<string, Record<string, unknown>>();
  for (const row of res.json() as { toolKey: string }[]) byKey.set(row.toolKey, row);
  return byKey;
};

const configIn = (environmentId: string, toolId: string) =>
  h.app.inject({
    method: 'GET',
    url: `/v1/environments/${environmentId}/tools/${toolId}/config`,
    headers: authed(),
  });

beforeAll(async () => {
  h = await setupTestApp();
  ws = await createWorkspace(h, 'inherit');
  prodEnvId = ws.environments[0]!.id;
  // A real developer member, so the RBAC assertion below sees 403 (role too
  // low) rather than 404 (not a member, project hidden).
  await addMember(h.db, ws.orgId, 'inherit-dev', 'developer');
  developerToken = await h.signToken('inherit-dev');

  for (const key of ['flag.on', 'flag.rollout', 'flag.off', 'flag.bare']) {
    const res = await h.app.inject({
      method: 'POST',
      url: `/v1/projects/${ws.projectId}/tools`,
      headers: authed(),
      payload: { key, name: key },
    });
    toolIds.set(key, res.json().id as string);
  }

  // Typed as an object, not `unknown`: inject() overloads on the payload and an
  // `unknown` argument picks the chainable form (see orgs.test.ts).
  const patch = (key: string, body: Record<string, unknown>) =>
    h.app.inject({
      method: 'PATCH',
      url: `/v1/environments/${prodEnvId}/tools/${toolIds.get(key)}/flag`,
      headers: authed(),
      payload: body,
    });
  await patch('flag.on', {
    enabled: true,
    targetingRules: [{ segments: ['beta'], conditions: [], enabled: true }],
  });
  await patch('flag.rollout', { enabled: true, rolloutPercent: 25 });
  await patch('flag.off', { enabled: false });

  for (const key of ['flag.on', 'flag.rollout']) {
    await h.app.inject({
      method: 'PUT',
      url: `/v1/environments/${prodEnvId}/tools/${toolIds.get(key)}/config`,
      headers: authed(),
      payload: { value: { limit: 5, variant: key } },
    });
  }
});
afterAll(async () => {
  await h.app.close();
});

describe('inheriting an environment', () => {
  let stagingId: string;

  it('reports what it copied', async () => {
    const res = await createEnvironment({
      key: 'staging',
      name: 'Staging',
      inheritFromEnvironmentId: prodEnvId,
    });
    expect(res.statusCode).toBe(201);
    stagingId = res.json().id;

    expect(res.json().inheritedFrom).toMatchObject({ id: prodEnvId, key: 'prod' });
    const copied = res.json().copied as { key: string; count: number }[];
    expect(copied.find((c) => c.key === 'flagStates')?.count).toBe(4);
    // Only two tools had config in Production.
    expect(copied.find((c) => c.key === 'toolConfigs')?.count).toBe(2);
  });

  it('copies enabled, rollout percentage and targeting rules', async () => {
    const source = await flagsIn(prodEnvId);
    const target = await flagsIn(stagingId);
    expect(target.size).toBe(4);

    for (const key of ['flag.on', 'flag.rollout', 'flag.off', 'flag.bare']) {
      expect(target.get(key)).toMatchObject({
        enabled: source.get(key)!.enabled,
        rolloutPercent: source.get(key)!.rolloutPercent,
        targetingRules: source.get(key)!.targetingRules,
      });
    }
    // Spot-check the interesting ones rather than trusting the loop alone.
    expect(target.get('flag.rollout')).toMatchObject({ enabled: true, rolloutPercent: 25 });
    expect(target.get('flag.on')!.targetingRules).toEqual([
      { segments: ['beta'], conditions: [], enabled: true },
    ]);
    expect(target.get('flag.off')).toMatchObject({ enabled: false, rolloutPercent: null });
  });

  it('copies config values, landing them at version 1 with matching history', async () => {
    const config = await configIn(stagingId, toolIds.get('flag.on')!);
    expect(config.json()).toMatchObject({ value: { limit: 5, variant: 'flag.on' }, version: 1 });

    // Version 1 in the new environment, even though Production is further along.
    const versions = await h.app.inject({
      method: 'GET',
      url: `/v1/environments/${stagingId}/tools/${toolIds.get('flag.on')}/config/versions`,
      headers: authed(),
    });
    expect(versions.json()).toHaveLength(1);
    expect(versions.json()[0]).toMatchObject({ version: 1, value: { variant: 'flag.on' } });
  });

  it('leaves a tool that had no config without one', async () => {
    const config = await configIn(stagingId, toolIds.get('flag.bare')!);
    expect(config.json()).toMatchObject({ value: null, version: 0 });
  });

  it('is a snapshot, not a link - later source edits do not propagate', async () => {
    await h.app.inject({
      method: 'PATCH',
      url: `/v1/environments/${prodEnvId}/tools/${toolIds.get('flag.rollout')}/flag`,
      headers: authed(),
      payload: { enabled: false, rolloutPercent: null },
    });

    expect((await flagsIn(prodEnvId)).get('flag.rollout')).toMatchObject({ enabled: false });
    expect((await flagsIn(stagingId)).get('flag.rollout')).toMatchObject({
      enabled: true,
      rolloutPercent: 25,
    });
  });

  it('records the source and the counts in the audit entry', async () => {
    const audit = await h.app.inject({
      method: 'GET',
      url: `/v1/orgs/${ws.orgId}/audit?limit=200`,
      headers: authed(),
    });
    const entry = (audit.json().entries as { action: string; after: Record<string, unknown> }[])
      .filter((e) => e.action === 'environment.create')
      .find((e) => e.after.key === 'staging');
    expect(entry?.after.inheritedFrom).toMatchObject({ key: 'prod' });
    expect(entry?.after.copied).toEqual({ flagStates: 4, toolConfigs: 2 });
  });

  it('does not copy API keys', async () => {
    await h.app.inject({
      method: 'POST',
      url: `/v1/environments/${prodEnvId}/keys`,
      headers: authed(),
      payload: { kind: 'server', name: 'prod key' },
    });
    const fresh = await createEnvironment({
      key: 'keyless',
      name: 'Keyless',
      inheritFromEnvironmentId: prodEnvId,
    });
    const keys = await h.app.inject({
      method: 'GET',
      url: `/v1/environments/${fresh.json().id}/keys`,
      headers: authed(),
    });
    expect(keys.json()).toEqual([]);
  });
});

describe('blank environments', () => {
  it.each([
    ['the field is omitted', {}],
    ['the field is null', { inheritFromEnvironmentId: null }],
  ])('starts empty when %s', async (_case, extra) => {
    const key = `blank-${String(_case.length)}`;
    const res = await createEnvironment({ key, name: 'Blank', ...extra });
    expect(res.statusCode).toBe(201);
    expect(res.json().inheritedFrom).toBeNull();
    expect(res.json().copied).toEqual([]);

    // The (tool, env) invariant still holds - the rows exist, all defaulted off.
    const flags = await flagsIn(res.json().id);
    expect(flags.size).toBe(4);
    for (const row of flags.values()) {
      expect(row).toMatchObject({ enabled: false, rolloutPercent: null, targetingRules: [] });
    }
  });
});

describe('inheriting from an empty environment', () => {
  it('copies flag state and reports zero config values', async () => {
    const empty = await createEnvironment({ key: 'empty-src', name: 'Empty source' });
    const child = await createEnvironment({
      key: 'empty-child',
      name: 'Empty child',
      inheritFromEnvironmentId: empty.json().id,
    });
    expect(child.statusCode).toBe(201);

    const copied = child.json().copied as { key: string; count: number }[];
    expect(copied.find((c) => c.key === 'flagStates')?.count).toBe(4);
    expect(copied.find((c) => c.key === 'toolConfigs')?.count).toBe(0);

    // The source's flags are all default-off, so the child's are too.
    for (const row of (await flagsIn(child.json().id)).values()) {
      expect(row).toMatchObject({ enabled: false, rolloutPercent: null });
    }
  });
});

describe('rejections', () => {
  it('refuses an environment from another project', async () => {
    const other = await createWorkspace(h, 'inherit-other');
    const res = await createEnvironment({
      key: 'cross',
      name: 'Cross',
      inheritFromEnvironmentId: other.environments[0]!.id,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/not an environment of this project/);
  });

  it('refuses an environment that does not exist', async () => {
    const res = await createEnvironment({
      key: 'ghost',
      name: 'Ghost',
      inheritFromEnvironmentId: '00000000-0000-4000-8000-000000000000',
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a malformed id before touching the database', async () => {
    const res = await createEnvironment({
      key: 'bad',
      name: 'Bad',
      inheritFromEnvironmentId: 'not-a-uuid',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('validation_error');
  });

  it('still requires admin, inheritance or not', async () => {
    for (const payload of [
      { key: 'nope-a', name: 'Nope', inheritFromEnvironmentId: prodEnvId },
      { key: 'nope-b', name: 'Nope' },
    ]) {
      const res = await createEnvironment(payload, developerToken);
      expect(res.statusCode).toBe(403);
    }
  });

  it('creates nothing at all when the source is invalid', async () => {
    const before = await h.app.inject({
      method: 'GET',
      url: `/v1/projects/${ws.projectId}/environments`,
      headers: authed(),
    });
    await createEnvironment({
      key: 'rolled-back',
      name: 'Rolled back',
      inheritFromEnvironmentId: '00000000-0000-4000-8000-000000000000',
    });
    const after = await h.app.inject({
      method: 'GET',
      url: `/v1/projects/${ws.projectId}/environments`,
      headers: authed(),
    });
    expect(after.json()).toHaveLength((before.json() as unknown[]).length);
  });
});
