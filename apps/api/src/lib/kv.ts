/**
 * KV clients for the delivery-plane handoff. The control plane only ever
 * WRITES here; the edge worker only ever reads (repo-guide boundary).
 *
 * KV key layout - the entire contract between the two planes:
 *   ruleset:{environmentId}  published ruleset snapshot JSON (frozen engine
 *                            schema). Metadata { contentHash, version } lets
 *                            the worker serve ETag/304 without parsing the body.
 *   keys:{environmentId}     active API-key hashes { server: [...], client: [...] }
 *                            so the worker authenticates callers with zero
 *                            origin/DB calls.
 */

export type KvMetadata = Record<string, string | number>;

export interface KvEntry {
  value: string | null;
  metadata: KvMetadata | null;
}

export interface KvClient {
  put(key: string, value: string, metadata?: KvMetadata): Promise<void>;
  getWithMetadata(key: string): Promise<KvEntry>;
  delete(key: string): Promise<void>;
  close?(): Promise<void>;
}

export const rulesetKvKey = (environmentId: string) => `ruleset:${environmentId}`;
export const apiKeysKvKey = (environmentId: string) => `keys:${environmentId}`;

// ── In-memory (tests) ─────────────────────────────────────────────────────────

export interface MemoryKvClient extends KvClient {
  store: Map<string, { value: string; metadata: KvMetadata | null }>;
}

export function createMemoryKvClient(): MemoryKvClient {
  const store = new Map<string, { value: string; metadata: KvMetadata | null }>();
  return {
    store,
    async put(key, value, metadata) {
      store.set(key, { value, metadata: metadata ?? null });
    },
    async getWithMetadata(key) {
      const entry = store.get(key);
      return entry ? { ...entry } : { value: null, metadata: null };
    },
    async delete(key) {
      store.delete(key);
    },
  };
}

// ── Miniflare (local dev) ─────────────────────────────────────────────────────

/**
 * Writes through workerd's real KV simulator, persisted to disk. Pointing
 * `persistPath` at the edge worker's `.wrangler/state/v3/kv` (and using the
 * same namespace id as wrangler.jsonc) makes `wrangler dev` in
 * apps/edge-worker read exactly what this API publishes.
 */
export function createMiniflareKvClient(opts: {
  namespaceId: string;
  persistPath: string;
}): KvClient {
  type Kv = {
    put(key: string, value: string, opts?: { metadata?: KvMetadata }): Promise<void>;
    getWithMetadata(key: string): Promise<{ value: string | null; metadata: unknown }>;
    delete(key: string): Promise<void>;
  };
  let instance: Promise<{ dispose(): Promise<void>; kv: Kv }> | undefined;

  const boot = async () => {
    const { Miniflare } = await import('miniflare');
    const mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response(null, { status: 404 }); } }',
      kvNamespaces: { KV: opts.namespaceId },
      kvPersist: opts.persistPath,
    });
    const kv = (await mf.getKVNamespace('KV')) as unknown as Kv;
    return { dispose: () => mf.dispose(), kv };
  };
  const get = () => (instance ??= boot());

  return {
    async put(key, value, metadata) {
      await (await get()).kv.put(key, value, metadata ? { metadata } : undefined);
    },
    async getWithMetadata(key) {
      const { value, metadata } = await (await get()).kv.getWithMetadata(key);
      return { value, metadata: (metadata as KvMetadata | null) ?? null };
    },
    async delete(key) {
      await (await get()).kv.delete(key);
    },
    async close() {
      if (instance) await (await instance).dispose();
    },
  };
}

// ── Cloudflare REST (production) ──────────────────────────────────────────────

export function createCloudflareKvClient(opts: {
  accountId: string;
  namespaceId: string;
  apiToken: string;
}): KvClient {
  const base = `https://api.cloudflare.com/client/v4/accounts/${opts.accountId}/storage/kv/namespaces/${opts.namespaceId}`;
  const headers = { authorization: `Bearer ${opts.apiToken}` };

  return {
    async put(key, value, metadata) {
      const form = new FormData();
      form.set('value', value);
      form.set('metadata', JSON.stringify(metadata ?? {}));
      const res = await fetch(`${base}/values/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers,
        body: form,
      });
      if (!res.ok) throw new Error(`KV put ${key} failed: HTTP ${res.status}`);
    },
    async getWithMetadata(key) {
      const res = await fetch(`${base}/values/${encodeURIComponent(key)}`, { headers });
      if (res.status === 404) return { value: null, metadata: null };
      if (!res.ok) throw new Error(`KV get ${key} failed: HTTP ${res.status}`);
      const value = await res.text();
      const metaRes = await fetch(`${base}/metadata/${encodeURIComponent(key)}`, { headers });
      const metadata = metaRes.ok
        ? (((await metaRes.json()) as { result?: KvMetadata }).result ?? null)
        : null;
      return { value, metadata };
    },
    async delete(key) {
      const res = await fetch(`${base}/values/${encodeURIComponent(key)}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok && res.status !== 404) {
        throw new Error(`KV delete ${key} failed: HTTP ${res.status}`);
      }
    },
  };
}
