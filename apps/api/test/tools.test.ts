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

beforeAll(async () => {
  h = await setupTestApp();
  ws = await createWorkspace(h);
  await addMember(h.db, ws.orgId, 'dev-user', 'developer');
  await addMember(h.db, ws.orgId, 'viewer-user', 'viewer');
  developerToken = await h.signToken('dev-user');
  viewerToken = await h.signToken('viewer-user');
});
afterAll(async () => {
  await h.app.close();
});

describe('tools CRUD', () => {
  let toolId: string;

  it('creates a tool (developer) and seeds a flag row in every environment', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: `/v1/projects/${ws.projectId}/tools`,
      headers: h.authed(developerToken),
      payload: {
        key: 'tool.summarize',
        name: 'Summarize',
        description: 'Condense text',
        tags: ['ai'],
        metadata: { category: 'ai' },
      },
    });
    expect(res.statusCode).toBe(201);
    toolId = res.json().id;

    for (const env of ws.environments) {
      const flags = await h.app.inject({
        method: 'GET',
        url: `/v1/environments/${env.id}/flags`,
        headers: h.authed(viewerToken),
      });
      const row = flags.json().find((f: { toolKey: string }) => f.toolKey === 'tool.summarize');
      expect(row).toBeDefined();
      expect(row.enabled).toBe(false);
    }
  });

  it('rejects duplicate keys (409) and invalid keys (400)', async () => {
    const dup = await h.app.inject({
      method: 'POST',
      url: `/v1/projects/${ws.projectId}/tools`,
      headers: h.authed(developerToken),
      payload: { key: 'tool.summarize', name: 'Again' },
    });
    expect(dup.statusCode).toBe(409);

    const bad = await h.app.inject({
      method: 'POST',
      url: `/v1/projects/${ws.projectId}/tools`,
      headers: h.authed(developerToken),
      payload: { key: 'Tool With Spaces', name: 'Bad' },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('filters the list by search, tag, and archived', async () => {
    await h.app.inject({
      method: 'POST',
      url: `/v1/projects/${ws.projectId}/tools`,
      headers: h.authed(developerToken),
      payload: { key: 'tool.translate', name: 'Translate', tags: ['i18n'] },
    });

    const bySearch = await h.app.inject({
      method: 'GET',
      url: `/v1/projects/${ws.projectId}/tools?search=summar`,
      headers: h.authed(viewerToken),
    });
    expect(bySearch.json().map((t: { key: string }) => t.key)).toEqual(['tool.summarize']);

    const byTag = await h.app.inject({
      method: 'GET',
      url: `/v1/projects/${ws.projectId}/tools?tag=i18n`,
      headers: h.authed(viewerToken),
    });
    expect(byTag.json().map((t: { key: string }) => t.key)).toEqual(['tool.translate']);

    const archive = await h.app.inject({
      method: 'PATCH',
      url: `/v1/tools/${toolId}`,
      headers: h.authed(developerToken),
      payload: { archived: true },
    });
    expect(archive.statusCode).toBe(200);

    const withoutArchived = await h.app.inject({
      method: 'GET',
      url: `/v1/projects/${ws.projectId}/tools`,
      headers: h.authed(viewerToken),
    });
    expect(withoutArchived.json().map((t: { key: string }) => t.key)).toEqual(['tool.translate']);

    const withArchived = await h.app.inject({
      method: 'GET',
      url: `/v1/projects/${ws.projectId}/tools?includeArchived=true`,
      headers: h.authed(viewerToken),
    });
    expect(withArchived.json()).toHaveLength(2);
  });

  it('returns tool detail with per-environment flag states', async () => {
    // A new project ships with Production alone, so add a second environment
    // here - otherwise "per-environment" is asserted against a single row and
    // the invariant (one flag-state per tool per env) goes untested.
    const staging = await h.app.inject({
      method: 'POST',
      url: `/v1/projects/${ws.projectId}/environments`,
      headers: h.authed(ws.adminToken),
      payload: { key: 'staging', name: 'Staging' },
    });
    expect(staging.statusCode).toBe(201);

    const res = await h.app.inject({
      method: 'GET',
      url: `/v1/tools/${toolId}`,
      headers: h.authed(viewerToken),
    });
    expect(res.statusCode).toBe(200);
    expect(
      res
        .json()
        .flagStates.map((s: { environmentId: string }) => s.environmentId)
        .sort(),
    ).toEqual([ws.environments[0]!.id, staging.json().id].sort());
  });

  it('restricts hard delete to admins', async () => {
    const forbidden = await h.app.inject({
      method: 'DELETE',
      url: `/v1/tools/${toolId}`,
      headers: h.authed(developerToken),
    });
    expect(forbidden.statusCode).toBe(403);

    const del = await h.app.inject({
      method: 'DELETE',
      url: `/v1/tools/${toolId}`,
      headers: h.authed(ws.adminToken),
    });
    expect(del.statusCode).toBe(204);
  });
});

/**
 * Typed flag definitions. The type is the flag's identity, so the interesting
 * cases are all about what CANNOT change after creation and what happens to
 * values that a definition edit would leave behind.
 */
describe('typed flag definitions', () => {
  const create = (payload: Record<string, unknown>) =>
    h.app.inject({
      method: 'POST',
      url: `/v1/projects/${ws.projectId}/tools`,
      headers: h.authed(developerToken),
      payload,
    });

  const detail = (toolId: string) =>
    h.app.inject({
      method: 'GET',
      url: `/v1/tools/${toolId}`,
      headers: h.authed(viewerToken),
    });

  it('refuses a string_enum with no options, and duplicate options', async () => {
    const noOptions = await create({
      key: 'typed.no-options',
      name: 'No options',
      valueType: 'string_enum',
    });
    expect(noOptions.statusCode).toBe(400);
    expect(noOptions.json().message).toMatch(/at least one option/);

    const dupes = await create({
      key: 'typed.dupes',
      name: 'Dupes',
      valueType: 'string_enum',
      enumOptions: ['fast', 'fast', 'quality'],
    });
    expect(dupes.statusCode).toBe(400);
    expect(dupes.json().message).toMatch(/duplicate enum options: fast/);
  });

  it('rejects a default value that does not fit the type', async () => {
    const res = await create({
      key: 'typed.bad-default',
      name: 'Bad default',
      valueType: 'string_enum',
      enumOptions: ['fast', 'quality'],
      defaultValue: 'turbo',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('validation_error');
  });

  it('seeds flag_states.value from the definition default in every environment', async () => {
    const created = await create({
      key: 'typed.banner',
      name: 'Banner',
      valueType: 'string',
      defaultValue: 'hello world',
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ valueType: 'string', defaultValue: 'hello world' });

    const states = detail(created.json().id);
    const rows = (await states).json().flagStates as { environmentKey: string; value: unknown }[];
    // Both environments this suite has by now - the second one was created after
    // some tools already existed, which is the path that used to be missed.
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) expect(row.value).toBe('hello world');
  });

  it('defaults an omitted definition to a boolean flag with no value', async () => {
    const created = await create({ key: 'typed.plain', name: 'Plain' });
    expect(created.json()).toMatchObject({
      valueType: 'boolean',
      enumOptions: [],
      defaultValue: null,
    });
    const rows = (await detail(created.json().id)).json().flagStates as { value: unknown }[];
    for (const row of rows) expect(row.value).toBeNull();
  });

  describe('editing a definition', () => {
    let toolId: string;
    let prodEnvId: string;

    beforeAll(async () => {
      const created = await create({
        key: 'typed.model',
        name: 'Model',
        valueType: 'string_enum',
        enumOptions: ['fast', 'balanced', 'quality'],
        defaultValue: 'fast',
      });
      toolId = created.json().id;
      prodEnvId = ws.environments[0]!.id;
      // Production is now serving 'balanced', so that option is load-bearing.
      const patched = await h.app.inject({
        method: 'PATCH',
        url: `/v1/environments/${prodEnvId}/tools/${toolId}/flag`,
        headers: h.authed(developerToken),
        payload: { enabled: true, value: 'balanced' },
      });
      expect(patched.statusCode).toBe(200);
    });

    const patchTool = (payload: Record<string, unknown>) =>
      h.app.inject({
        method: 'PATCH',
        url: `/v1/tools/${toolId}`,
        headers: h.authed(developerToken),
        payload,
      });

    it('refuses to change the type', async () => {
      const res = await patchTool({ valueType: 'string' });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toMatch(/type cannot be changed/);

      // And the stored type is untouched.
      expect((await detail(toolId)).json().valueType).toBe('string_enum');
    });

    it('refuses to remove an option an environment is serving, naming it', async () => {
      const res = await patchTool({ enumOptions: ['fast', 'quality'] });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toMatch(/balanced/);
      expect(res.json().message).toMatch(/environment "prod"/);
      expect((await detail(toolId)).json().enumOptions).toEqual(['fast', 'balanced', 'quality']);
    });

    it('refuses to remove an option a targeting rule is serving', async () => {
      await h.app.inject({
        method: 'PATCH',
        url: `/v1/environments/${prodEnvId}/tools/${toolId}/flag`,
        headers: h.authed(developerToken),
        payload: {
          value: 'fast',
          targetingRules: [{ segments: [], conditions: [], enabled: true, value: 'balanced' }],
        },
      });
      const res = await patchTool({ enumOptions: ['fast', 'quality'] });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toMatch(/environment "prod"/);
    });

    it('allows removing an unused option, and adding new ones', async () => {
      const removed = await patchTool({ enumOptions: ['fast', 'balanced'] });
      expect(removed.statusCode).toBe(200);
      expect(removed.json().enumOptions).toEqual(['fast', 'balanced']);

      const added = await patchTool({ enumOptions: ['fast', 'balanced', 'thorough'] });
      expect(added.statusCode).toBe(200);
      expect(added.json().enumOptions).toEqual(['fast', 'balanced', 'thorough']);
    });

    it('moves the default onto a surviving option in one request', async () => {
      // Move EVERY environment off 'fast' first (they were all seeded onto it as
      // the definition default), so the only thing still holding the option is
      // the default itself - which is what this request replaces.
      const states = (await detail(toolId)).json().flagStates as { environmentId: string }[];
      for (const state of states) {
        await h.app.inject({
          method: 'PATCH',
          url: `/v1/environments/${state.environmentId}/tools/${toolId}/flag`,
          headers: h.authed(developerToken),
          payload: { value: 'balanced', targetingRules: [] },
        });
      }

      const blocked = await patchTool({ enumOptions: ['balanced', 'thorough'] });
      expect(blocked.statusCode).toBe(400);
      expect(blocked.json().message).toMatch(/default value/);

      const res = await patchTool({
        enumOptions: ['balanced', 'thorough'],
        defaultValue: 'thorough',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        enumOptions: ['balanced', 'thorough'],
        defaultValue: 'thorough',
      });
    });

    it('rejects a default that is not a member, and one on a boolean flag', async () => {
      const notAMember = await patchTool({ defaultValue: 'fast' });
      expect(notAMember.statusCode).toBe(400);
      expect(notAMember.json().error).toBe('validation_error');

      const boolTool = await create({ key: 'typed.bool', name: 'Bool' });
      const res = await h.app.inject({
        method: 'PATCH',
        url: `/v1/tools/${boolTool.json().id}`,
        headers: h.authed(developerToken),
        payload: { defaultValue: true },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toMatch(/boolean flags carry no default value/);
    });
  });
});

describe('bulk upsert (CLI-sync target)', () => {
  const manifest = (entries: object[], archiveMissing = false) => ({
    method: 'PUT' as const,
    url: `/v1/projects/${ws.projectId}/tools/bulk`,
    headers: h.authed(developerToken),
    payload: { tools: entries, archiveMissing },
  });

  it('creates new tools, seeding default config as version 1 everywhere', async () => {
    const res = await h.app.inject(
      manifest([
        {
          key: 'bulk.one',
          name: 'Bulk One',
          defaultConfig: { limit: 5, fallback: { mode: 'hide' } },
        },
        { key: 'bulk.two', name: 'Bulk Two', tags: ['x'] },
      ]),
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      created: ['bulk.one', 'bulk.two'],
      updated: [],
      archived: [],
    });

    const tools = await h.app.inject({
      method: 'GET',
      url: `/v1/projects/${ws.projectId}/tools?search=bulk.one`,
      headers: h.authed(viewerToken),
    });
    const toolOne = tools.json()[0];
    const env = ws.environments[0];
    const config = await h.app.inject({
      method: 'GET',
      url: `/v1/environments/${env?.id}/tools/${toolOne.id}/config`,
      headers: h.authed(viewerToken),
    });
    expect(config.json().version).toBe(1);
    expect(config.json().value).toEqual({ limit: 5, fallback: { mode: 'hide' } });
  });

  it('is idempotent - the same manifest again is all unchanged', async () => {
    const res = await h.app.inject(
      manifest([
        {
          key: 'bulk.one',
          name: 'Bulk One',
          defaultConfig: { limit: 5, fallback: { mode: 'hide' } },
        },
        { key: 'bulk.two', name: 'Bulk Two', tags: ['x'] },
      ]),
    );
    expect(res.json()).toMatchObject({ created: [], updated: [], archived: [], unchanged: 2 });
  });

  it('updates changed entries and archives missing ones with archiveMissing', async () => {
    const res = await h.app.inject(manifest([{ key: 'bulk.one', name: 'Bulk One Renamed' }], true));
    expect(res.json()).toMatchObject({
      created: [],
      updated: ['bulk.one'],
      archived: expect.arrayContaining(['bulk.two']),
    });
  });

  it('unarchives tools that reappear in the manifest', async () => {
    const res = await h.app.inject(
      manifest([
        { key: 'bulk.one', name: 'Bulk One Renamed' },
        { key: 'bulk.two', name: 'Bulk Two', tags: ['x'] },
      ]),
    );
    expect(res.json().updated).toContain('bulk.two');
  });

  it('rejects duplicate keys in one manifest and enforces the developer role', async () => {
    const dup = await h.app.inject(
      manifest([
        { key: 'dup.key', name: 'A' },
        { key: 'dup.key', name: 'B' },
      ]),
    );
    expect(dup.statusCode).toBe(400);

    const forbidden = await h.app.inject({
      method: 'PUT',
      url: `/v1/projects/${ws.projectId}/tools/bulk`,
      headers: h.authed(viewerToken),
      payload: { tools: [{ key: 'x.y', name: 'X' }] },
    });
    expect(forbidden.statusCode).toBe(403);
  });
});
