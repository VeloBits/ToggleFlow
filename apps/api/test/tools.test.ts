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
    const res = await h.app.inject({
      method: 'GET',
      url: `/v1/tools/${toolId}`,
      headers: h.authed(viewerToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().flagStates).toHaveLength(3);
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

  it('is idempotent — the same manifest again is all unchanged', async () => {
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
