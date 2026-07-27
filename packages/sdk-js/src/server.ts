/**
 * Server client — the authoritative enforcement point (brief §6).
 *
 * Boot-fetches the full ruleset from the delivery API, caches it in memory,
 * and evaluates locally via @toggleflow/engine — a flag check costs ~0ms and
 * never leaves the process. Background ETag polling (default 30s) picks up
 * changes; on ANY fetch error the last good ruleset keeps serving
 * (stale-if-error) — the platform being down never breaks your app.
 */
import {
  evaluateAll,
  evaluateTool,
  parseRulesetSnapshot,
  type JsonObject,
  type JsonValue,
  type RulesetSnapshot,
  type ToolEvaluation,
  type UserContext,
} from '@toggleflow/engine';

import { createPollingTransport, type Unsubscribe, type UpdateTransport } from './transport';

/** Loose user input: `attributes` optional; normalized before evaluation. */
export interface UserContextInput {
  key: string;
  attributes?: Record<string, string | number | boolean>;
}

export const ANONYMOUS: UserContextInput = { key: 'anonymous' };

export interface ServerUpdate {
  snapshot: RulesetSnapshot;
  version: number;
}

export interface ServerClientOptions {
  /** Base URL of the delivery API (the edge worker), e.g. https://edge.example.com */
  edgeUrl: string;
  environmentId: string;
  /** Secret server key (tf_srv_...). Never expose to browsers. */
  serverKey: string;
  /** Poll cadence; default 30s. (Polling is an internal transport — see transport.ts.) */
  pollIntervalMs?: number;
  /** Optional snapshot JSON for cold start: evaluate instantly, before the first fetch. */
  bootstrap?: unknown;
  /** Injectable for tests. */
  fetch?: typeof globalThis.fetch;
  /** Called on every failed refresh; the last good ruleset keeps serving regardless. */
  onError?: (error: Error) => void;
}

const normalize = (user: UserContextInput): UserContext => ({
  key: user.key,
  attributes: user.attributes ?? {},
});

export class ToggleFlowServerClient {
  private snapshot: RulesetSnapshot | null = null;
  private etag: string | null = null;
  private readonly listeners = new Set<(update: ServerUpdate) => void>();
  private readonly transport: UpdateTransport;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly readyPromise: Promise<void>;
  private resolveReady!: () => void;

  constructor(private readonly options: ServerClientOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
    if (options.bootstrap !== undefined) {
      this.apply(parseRulesetSnapshot(options.bootstrap), { notify: false });
    }
    this.transport = createPollingTransport({
      intervalMs: options.pollIntervalMs ?? 30_000,
      tick: () => this.refresh(),
    });
    this.transport.start();
  }

  /** Resolves once a ruleset is available (bootstrap counts). */
  waitForReady(timeoutMs?: number): Promise<void> {
    if (timeoutMs === undefined) return this.readyPromise;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`ToggleFlow: no ruleset after ${timeoutMs}ms`)),
        timeoutMs,
      );
      void this.readyPromise.then(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  get ready(): boolean {
    return this.snapshot !== null;
  }

  /** Full evaluation (enabled, reason, config, fallback). Safe before ready: disabled/not_found. */
  evaluate(toolKey: string, user: UserContextInput = ANONYMOUS): ToolEvaluation {
    if (!this.snapshot) {
      return { key: toolKey, enabled: false, reason: 'not_found', config: null, fallback: null };
    }
    return evaluateTool(this.snapshot, toolKey, normalize(user));
  }

  isEnabled(toolKey: string, user: UserContextInput = ANONYMOUS): boolean {
    return this.evaluate(toolKey, user).enabled;
  }

  evaluateAll(user: UserContextInput = ANONYMOUS): Record<string, ToolEvaluation> {
    return this.snapshot ? evaluateAll(this.snapshot, normalize(user)) : {};
  }

  /** The tool's live config value — user-independent. */
  getConfig(toolKey: string): JsonObject | null {
    return this.snapshot?.tools[toolKey]?.config ?? null;
  }

  /** The payload to serve when the tool is disabled (config.fallback). */
  getFallback(toolKey: string): JsonValue | null {
    const config = this.getConfig(toolKey);
    return config?.fallback ?? null;
  }

  getSnapshot(): RulesetSnapshot | null {
    return this.snapshot;
  }

  /**
   * Notifies on every applied ruleset update. The interface is
   * transport-agnostic: when SSE replaces polling, subscribers see the same
   * events — no code change.
   */
  subscribe(listener: (update: ServerUpdate) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Force one refresh cycle now (rarely needed — polling runs by itself). */
  refreshNow(): Promise<void> {
    return this.transport.refreshNow();
  }

  close(): void {
    this.transport.stop();
    this.listeners.clear();
  }

  private async refresh(): Promise<void> {
    try {
      const headers: Record<string, string> = {
        authorization: `Bearer ${this.options.serverKey}`,
      };
      if (this.etag) headers['if-none-match'] = this.etag;
      const url = `${this.options.edgeUrl}/v1/ruleset?environment=${encodeURIComponent(this.options.environmentId)}`;
      const res = await this.fetchImpl(url, { headers });
      if (res.status === 304) return;
      if (!res.ok) throw new Error(`ToggleFlow: ruleset fetch failed with HTTP ${res.status}`);
      const snapshot = parseRulesetSnapshot(await res.json());
      this.etag = res.headers.get('etag');
      this.apply(snapshot, { notify: true });
    } catch (err) {
      // Stale-if-error: keep the cached ruleset, report, let the next cycle retry.
      this.options.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private apply(snapshot: RulesetSnapshot, opts: { notify: boolean }): void {
    const previous = this.snapshot;
    this.snapshot = snapshot;
    this.resolveReady();
    if (!opts.notify || previous?.version === snapshot.version) return;
    const update: ServerUpdate = { snapshot, version: snapshot.version };
    for (const listener of this.listeners) listener(update);
  }
}

export function createServerClient(options: ServerClientOptions): ToggleFlowServerClient {
  return new ToggleFlowServerClient(options);
}
