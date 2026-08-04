/**
 * The publish pipeline (Phase 4 - fills the Phase 3 stub): every mutation
 * schedules a debounced publish; each publish builds the environment's
 * ruleset, stamps a monotonic version + content hash, persists it to
 * ruleset_versions (Postgres is the source of truth - KV is always
 * republishable from here), THEN writes to KV. API-key hashes are published
 * separately so the worker can authenticate without touching origin or DB.
 */
import { parseRulesetSnapshot } from '@toggleflow/engine';
import { and, desc, eq, isNull } from 'drizzle-orm';

import type { Db } from '../db';
import { apiKeys, rulesetVersions } from '../db/schema';
import { apiKeysKvKey, rulesetKvKey, type KvClient } from './kv';
import { buildSnapshotContent, hashContent } from './snapshot';

export interface RulesetPublishResult {
  environmentId: string;
  /** True when content was unchanged and no new version/KV write happened. */
  skipped: boolean;
  version?: number;
  contentHash?: string;
}

export interface KeysPublishResult {
  environmentId: string;
  server: number;
  client: number;
}

interface Logger {
  error(obj: unknown, msg?: string): void;
}

export class Publisher {
  private readonly timers = new Map<
    string,
    { timer: NodeJS.Timeout; task: () => Promise<unknown> }
  >();
  private readonly inFlight = new Set<Promise<unknown>>();
  private closed = false;

  constructor(
    private readonly db: Db,
    private readonly kv: KvClient,
    private readonly opts: { debounceMs: number; logger?: Logger },
  ) {}

  /** Debounced - call freely on every mutation. */
  scheduleRuleset(environmentId: string): void {
    this.schedule(`ruleset:${environmentId}`, () => this.publishRuleset(environmentId));
  }

  /** Debounced - call on API-key create/revoke. */
  scheduleKeys(environmentId: string): void {
    this.schedule(`keys:${environmentId}`, () => this.publishKeys(environmentId));
  }

  async publishRuleset(
    environmentId: string,
    opts: { force?: boolean } = {},
  ): Promise<RulesetPublishResult> {
    const content = await buildSnapshotContent(this.db, environmentId);
    if (!content) return { environmentId, skipped: true };
    const contentHash = hashContent(content);

    // Monotonic version per environment; the unique index arbitrates races.
    let row: typeof rulesetVersions.$inferSelect | undefined;
    let reused = false;
    for (let attempt = 0; attempt < 3 && !row; attempt++) {
      const [latest] = await this.db
        .select()
        .from(rulesetVersions)
        .where(eq(rulesetVersions.environmentId, environmentId))
        .orderBy(desc(rulesetVersions.version))
        .limit(1);
      if (latest?.contentHash === contentHash) {
        row = latest;
        reused = true;
        break;
      }
      const version = (latest?.version ?? 0) + 1;
      const snapshot = { ...content, version, publishedAt: new Date().toISOString() };
      /*
       * Persist the PARSED result, not the input.
       *
       * The parse was previously called for its throw alone and the raw object
       * was stored, so any field the frozen schema does not declare reached both
       * Postgres and KV - where the edge worker's safeParse strips it at READ
       * time. That turns "the control plane published something the contract
       * does not allow" into a silent, per-request omission at the edge instead
       * of a loud failure at publish. Storing `validated` makes what is served
       * byte-for-byte what the contract accepted.
       *
       * Hash-safe: `contentHash` is computed above from `content`, before
       * version/publishedAt exist, and `buildSnapshotContent` is deterministic -
       * so parsing cannot move the hash.
       */
      const validated = parseRulesetSnapshot(snapshot);
      try {
        [row] = await this.db
          .insert(rulesetVersions)
          .values({ environmentId, version, contentHash, snapshot: validated })
          .returning();
      } catch (err) {
        const code = (err as { cause?: { code?: string } }).cause?.code;
        if (code !== '23505') throw err;
      }
    }
    if (!row) throw new Error(`ruleset publish for ${environmentId} lost every version race`);

    if (reused && !opts.force) {
      return { environmentId, skipped: true, version: row.version, contentHash };
    }
    await this.kv.put(rulesetKvKey(environmentId), JSON.stringify(row.snapshot), {
      contentHash: row.contentHash,
      version: row.version,
    });
    return { environmentId, skipped: false, version: row.version, contentHash: row.contentHash };
  }

  async publishKeys(environmentId: string): Promise<KeysPublishResult> {
    const rows = await this.db
      .select({ kind: apiKeys.kind, keyHash: apiKeys.keyHash })
      .from(apiKeys)
      .where(and(eq(apiKeys.environmentId, environmentId), isNull(apiKeys.revokedAt)));
    const payload = {
      server: rows
        .filter((r) => r.kind === 'server')
        .map((r) => r.keyHash)
        .sort(),
      client: rows
        .filter((r) => r.kind === 'client')
        .map((r) => r.keyHash)
        .sort(),
    };
    await this.kv.put(apiKeysKvKey(environmentId), JSON.stringify(payload));
    return { environmentId, server: payload.server.length, client: payload.client.length };
  }

  /** Called when an environment is deleted: drop its KV entries and pending work. */
  async removeEnvironment(environmentId: string): Promise<void> {
    for (const key of [`ruleset:${environmentId}`, `keys:${environmentId}`]) {
      const pending = this.timers.get(key);
      if (pending) {
        clearTimeout(pending.timer);
        this.timers.delete(key);
      }
    }
    await Promise.all([
      this.kv.delete(rulesetKvKey(environmentId)),
      this.kv.delete(apiKeysKvKey(environmentId)),
    ]);
  }

  /** Run everything still debounce-pending and wait for all publishes (tests, shutdown). */
  async flushAll(): Promise<void> {
    for (const [key, pending] of [...this.timers]) {
      clearTimeout(pending.timer);
      this.timers.delete(key);
      this.run(pending.task);
    }
    while (this.inFlight.size > 0) {
      await Promise.allSettled([...this.inFlight]);
    }
  }

  /** Drop pending work and wait for in-flight publishes; used on server close. */
  async close(): Promise<void> {
    this.closed = true;
    for (const [, pending] of this.timers) clearTimeout(pending.timer);
    this.timers.clear();
    await Promise.allSettled([...this.inFlight]);
  }

  private schedule(key: string, task: () => Promise<unknown>): void {
    if (this.closed) return;
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => {
      this.timers.delete(key);
      this.run(task);
    }, this.opts.debounceMs);
    timer.unref?.();
    this.timers.set(key, { timer, task });
  }

  private run(task: () => Promise<unknown>): void {
    const promise = task().catch((err) => {
      // KV/publish failures must never break the mutation path: Postgres is
      // the source of truth and the republish endpoint can heal KV.
      this.opts.logger?.error(err, 'publish failed');
    });
    this.inFlight.add(promise);
    void promise.finally(() => this.inFlight.delete(promise));
  }
}
