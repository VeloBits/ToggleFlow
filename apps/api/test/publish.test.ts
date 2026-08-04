import { createHash } from 'node:crypto';

import { parseRulesetSnapshot } from '@toggleflow/engine';
import { desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { rulesetVersions } from '../src/db/schema';
import { apiKeysKvKey, rulesetKvKey, type MemoryKvClient } from '../src/lib/kv';
import { createMemoryKvClient } from '../src/lib/kv';
import { buildSnapshotContent, stableStringify } from '../src/lib/snapshot';
import { createWorkspace, setupTestApp, type TestHarness, type Workspace } from './helpers';

let h: TestHarness;
let kv: MemoryKvClient;
let ws: Workspace;
let toolId: string;
let envId: string;

const readSnapshot = async () => {
  const entry = await kv.getWithMetadata(rulesetKvKey(envId));
  expect(entry.value).not.toBeNull();
  return { snapshot: parseRulesetSnapshot(JSON.parse(entry.value!)), metadata: entry.metadata };
};

beforeAll(async () => {
  kv = createMemoryKvClient();
  h = await setupTestApp({ kv });
  ws = await createWorkspace(h);
  envId = ws.environments.find((e) => e.key === 'prod')!.id;
  const tool = await h.app.inject({
    method: 'POST',
    url: `/v1/projects/${ws.projectId}/tools`,
    headers: h.authed(ws.adminToken),
    payload: { key: 'tool.published', name: 'Published' },
  });
  toolId = tool.json().id;
});
afterAll(async () => {
  await h.app.close();
});

describe('publish pipeline', () => {
  it('a flag mutation lands a valid frozen-schema snapshot in KV with version 1', async () => {
    const res = await h.app.inject({
      method: 'PATCH',
      url: `/v1/environments/${envId}/tools/${toolId}/flag`,
      headers: h.authed(ws.adminToken),
      payload: { enabled: true },
    });
    expect(res.statusCode).toBe(200);
    await h.app.publisher.flushAll();

    const { snapshot, metadata } = await readSnapshot();
    expect(snapshot.environmentId).toBe(envId);
    expect(snapshot.environmentKey).toBe('prod');
    expect(snapshot.tools['tool.published']).toMatchObject({ enabled: true });
    expect(snapshot.version).toBe(1);
    expect(metadata).toMatchObject({ version: 1 });
    expect(metadata?.contentHash).toMatch(/^[0-9a-f]{64}$/);

    // Postgres is the source of truth: the same snapshot is persisted.
    const rows = await h.db
      .select()
      .from(rulesetVersions)
      .where(eq(rulesetVersions.environmentId, envId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.version).toBe(1);
    expect(rows[0]!.contentHash).toBe(metadata?.contentHash);

    const audit = await h.app.inject({
      method: 'GET',
      url: `/v1/orgs/${ws.orgId}/audit`,
      headers: h.authed(ws.adminToken),
    });
    expect(audit.json().entries.map((e: { action: string }) => e.action)).toContain('flag.update');
  });

  it('another mutation bumps the version and changes the content hash', async () => {
    const before = await readSnapshot();
    await h.app.inject({
      method: 'PATCH',
      url: `/v1/environments/${envId}/tools/${toolId}/flag`,
      headers: h.authed(ws.adminToken),
      payload: { rolloutPercent: 25 },
    });
    await h.app.publisher.flushAll();

    const { snapshot, metadata } = await readSnapshot();
    expect(snapshot.version).toBe(2);
    expect(snapshot.tools['tool.published']).toMatchObject({ enabled: true, rolloutPercent: 25 });
    expect(metadata?.contentHash).not.toBe(before.metadata?.contentHash);
  });

  it('config edits ride the same pipe', async () => {
    await h.app.inject({
      method: 'PUT',
      url: `/v1/environments/${envId}/tools/${toolId}/config`,
      headers: h.authed(ws.adminToken),
      payload: { value: { limit: 9, fallback: { mode: 'hide' } } },
    });
    await h.app.publisher.flushAll();
    const { snapshot } = await readSnapshot();
    expect(snapshot.version).toBe(3);
    expect(snapshot.tools['tool.published']!.config).toEqual({
      limit: 9,
      fallback: { mode: 'hide' },
    });
  });

  it('deduplicates: identical content publishes no new version', async () => {
    // Re-applying the same flag state changes nothing content-wise.
    await h.app.inject({
      method: 'PATCH',
      url: `/v1/environments/${envId}/tools/${toolId}/flag`,
      headers: h.authed(ws.adminToken),
      payload: { rolloutPercent: 25 },
    });
    await h.app.publisher.flushAll();

    const { snapshot } = await readSnapshot();
    expect(snapshot.version).toBe(3);
    const [latest] = await h.db
      .select()
      .from(rulesetVersions)
      .where(eq(rulesetVersions.environmentId, envId))
      .orderBy(desc(rulesetVersions.version))
      .limit(1);
    expect(latest!.version).toBe(3);
  });

  it('archived tools drop out of the snapshot', async () => {
    await h.app.inject({
      method: 'PATCH',
      url: `/v1/tools/${toolId}`,
      headers: h.authed(ws.adminToken),
      payload: { archived: true },
    });
    await h.app.publisher.flushAll();
    const { snapshot } = await readSnapshot();
    expect(snapshot.tools['tool.published']).toBeUndefined();

    await h.app.inject({
      method: 'PATCH',
      url: `/v1/tools/${toolId}`,
      headers: h.authed(ws.adminToken),
      payload: { archived: false },
    });
    await h.app.publisher.flushAll();
  });

  it('publishes API-key hashes on create and removes them on revoke', async () => {
    const created = await h.app.inject({
      method: 'POST',
      url: `/v1/environments/${envId}/keys`,
      headers: h.authed(ws.adminToken),
      payload: { name: 'edge key', kind: 'server' },
    });
    const { id, token } = created.json();
    await h.app.publisher.flushAll();

    const hash = createHash('sha256').update(token).digest('hex');
    let entry = await kv.getWithMetadata(apiKeysKvKey(envId));
    expect(JSON.parse(entry.value!)).toEqual({ server: [hash], client: [] });

    await h.app.inject({
      method: 'DELETE',
      url: `/v1/api-keys/${id}`,
      headers: h.authed(ws.adminToken),
    });
    await h.app.publisher.flushAll();
    entry = await kv.getWithMetadata(apiKeysKvKey(envId));
    expect(JSON.parse(entry.value!)).toEqual({ server: [], client: [] });
  });

  it('the republish endpoint restores KV after a simulated wipe without a version bump', async () => {
    const before = await readSnapshot();
    kv.store.clear(); // simulated KV wipe

    const res = await h.app.inject({
      method: 'POST',
      url: `/v1/environments/${envId}/publish`,
      headers: h.authed(ws.adminToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ruleset.skipped).toBe(false);
    expect(body.ruleset.version).toBe(before.snapshot.version);

    const restored = await readSnapshot();
    expect(restored.snapshot).toEqual(before.snapshot);
    expect(await kv.getWithMetadata(apiKeysKvKey(envId))).toMatchObject({
      value: expect.any(String),
    });

    const audit = await h.app.inject({
      method: 'GET',
      url: `/v1/orgs/${ws.orgId}/audit`,
      headers: h.authed(ws.adminToken),
    });
    expect(audit.json().entries.map((e: { action: string }) => e.action)).toContain(
      'ruleset.republish',
    );
  });

  /**
   * The silent-strip trap. The publisher used to validate the snapshot and then
   * persist the UNVALIDATED object, so any field the frozen schema does not
   * declare reached KV and was dropped by the edge worker's safeParse at read
   * time - a failure that shows up as a missing value in production rather than
   * as a failed publish.
   */
  it('publishes typed flag values that survive a re-parse unchanged', async () => {
    const enumTool = await h.app.inject({
      method: 'POST',
      url: `/v1/projects/${ws.projectId}/tools`,
      headers: h.authed(ws.adminToken),
      payload: {
        key: 'tool.model',
        name: 'Model',
        valueType: 'string_enum',
        enumOptions: ['fast', 'balanced', 'quality'],
        defaultValue: 'balanced',
      },
    });
    expect(enumTool.statusCode).toBe(201);
    const patched = await h.app.inject({
      method: 'PATCH',
      url: `/v1/environments/${envId}/tools/${enumTool.json().id}/flag`,
      headers: h.authed(ws.adminToken),
      payload: {
        enabled: true,
        value: 'quality',
        targetingRules: [{ segments: [], conditions: [], enabled: true, value: 'fast' }],
      },
    });
    expect(patched.statusCode).toBe(200);
    await h.app.publisher.flushAll();

    const raw = JSON.parse((await kv.getWithMetadata(rulesetKvKey(envId))).value!);
    // Nothing added, nothing removed: what is in KV is exactly what the frozen
    // schema accepts, so the worker cannot quietly drop a field on read.
    expect(parseRulesetSnapshot(raw)).toEqual(raw);
    expect(raw.tools['tool.model']).toMatchObject({
      valueType: 'string_enum',
      value: 'quality',
      targetingRules: [{ enabled: true, value: 'fast' }],
    });
  });

  /**
   * The omit-when-default rule (lib/snapshot.ts). Without it, adding typed flags
   * would have changed every content hash in the fleet, republishing every
   * environment on its next mutation for no change in meaning.
   */
  it('does not churn the content hash of an all-boolean environment', async () => {
    const plain = await createWorkspace(h, 'publish-boolean');
    const plainEnvId = plain.environments[0]!.id;
    await h.app.inject({
      method: 'POST',
      url: `/v1/projects/${plain.projectId}/tools`,
      headers: h.authed(plain.adminToken),
      payload: { key: 'tool.plain', name: 'Plain' },
    });
    await h.app.publisher.flushAll();

    const versionsBefore = await h.db
      .select()
      .from(rulesetVersions)
      .where(eq(rulesetVersions.environmentId, plainEnvId));

    // Unforced, exactly as the debounced path calls it.
    const first = await h.app.publisher.publishRuleset(plainEnvId);
    const second = await h.app.publisher.publishRuleset(plainEnvId);
    expect(first.skipped).toBe(true);
    expect(second).toMatchObject({ skipped: true, version: first.version });
    expect(
      await h.db
        .select()
        .from(rulesetVersions)
        .where(eq(rulesetVersions.environmentId, plainEnvId)),
    ).toHaveLength(versionsBefore.length);

    // And the reason it cannot churn: the hashed object carries no typed-flag
    // fields at all for a boolean flag, so it serialises as it always did.
    const content = await buildSnapshotContent(h.db, plainEnvId);
    expect(content!.tools['tool.plain']).toMatchObject({ valueType: undefined, value: undefined });
    expect(stableStringify(content)).not.toContain('valueType');
  });

  it('deleting an environment removes its KV entries', async () => {
    const created = await h.app.inject({
      method: 'POST',
      url: `/v1/projects/${ws.projectId}/environments`,
      headers: h.authed(ws.adminToken),
      payload: { key: 'ephemeral', name: 'Ephemeral' },
    });
    const ephemeralId = created.json().id;
    await h.app.publisher.flushAll();
    expect((await kv.getWithMetadata(rulesetKvKey(ephemeralId))).value).not.toBeNull();

    await h.app.inject({
      method: 'DELETE',
      url: `/v1/environments/${ephemeralId}`,
      headers: h.authed(ws.adminToken),
    });
    expect((await kv.getWithMetadata(rulesetKvKey(ephemeralId))).value).toBeNull();
  });
});
