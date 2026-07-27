/**
 * Exercises the REAL local-KV path (workerd via miniflare) end to end:
 * an API mutation must land a readable snapshot in miniflare-persisted KV —
 * the same storage `wrangler dev` will read in Phase 5.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseRulesetSnapshot } from '@toggleflow/engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMiniflareKvClient, rulesetKvKey, type KvClient } from '../src/lib/kv';
import { createWorkspace, setupTestApp, type TestHarness, type Workspace } from './helpers';

let persistDir: string;
let kv: KvClient;
let h: TestHarness;
let ws: Workspace;

beforeAll(async () => {
  persistDir = mkdtempSync(join(tmpdir(), 'toggleflow-kv-'));
  kv = createMiniflareKvClient({
    namespaceId: 'toggleflow-rulesets-test',
    persistPath: persistDir,
  });
  h = await setupTestApp({ kv });
  ws = await createWorkspace(h);
}, 60_000);

afterAll(async () => {
  await h.app.close(); // also disposes the miniflare instance via kv.close()
  rmSync(persistDir, { recursive: true, force: true });
});

describe('miniflare local KV', () => {
  it('roundtrips values with metadata', async () => {
    await kv.put('probe', 'hello', { contentHash: 'abc', version: 7 });
    const entry = await kv.getWithMetadata('probe');
    expect(entry.value).toBe('hello');
    expect(entry.metadata).toEqual({ contentHash: 'abc', version: 7 });
    await kv.delete('probe');
    expect((await kv.getWithMetadata('probe')).value).toBeNull();
  });

  it('an API mutation publishes a snapshot readable from workerd KV', async () => {
    const envId = ws.environments.find((e) => e.key === 'prod')!.id;
    const tool = await h.app.inject({
      method: 'POST',
      url: `/v1/projects/${ws.projectId}/tools`,
      headers: h.authed(ws.adminToken),
      payload: { key: 'tool.mf', name: 'Miniflare Tool' },
    });
    await h.app.inject({
      method: 'PATCH',
      url: `/v1/environments/${envId}/tools/${tool.json().id}/flag`,
      headers: h.authed(ws.adminToken),
      payload: { enabled: true },
    });
    await h.app.publisher.flushAll();

    const entry = await kv.getWithMetadata(rulesetKvKey(envId));
    expect(entry.value).not.toBeNull();
    const snapshot = parseRulesetSnapshot(JSON.parse(entry.value!));
    expect(snapshot.tools['tool.mf']).toMatchObject({ enabled: true });
    expect(entry.metadata?.version).toBe(snapshot.version);
  }, 30_000);
});
