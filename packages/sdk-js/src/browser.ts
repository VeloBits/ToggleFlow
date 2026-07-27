/**
 * Browser client — cosmetic enforcement (brief §6): hide disabled tools and
 * show fallback notices so users never click a dead button. Fetches
 * ALREADY-EVALUATED flags for the current user from the edge — targeting
 * rules never reach the browser. Same subscribe abstraction as the server
 * client, so SSE can replace polling without breaking changes.
 */
import type { JsonObject, JsonValue } from '@toggleflow/engine';

import type { UserContextInput } from './server';
import { createPollingTransport, type Unsubscribe, type UpdateTransport } from './transport';

export interface EvaluatedFlag {
  enabled: boolean;
  config: JsonObject | null;
  fallback: JsonValue | null;
}

export interface FlagsSnapshot {
  environmentId: string;
  environmentKey: string;
  version: number;
  flags: Record<string, EvaluatedFlag>;
}

export interface BrowserClientOptions {
  /** Base URL of the delivery API (the edge worker). */
  edgeUrl: string;
  environmentId: string;
  /** Client key (tf_cli_...) — designed to be public. */
  clientKey: string;
  /** The current user; drives targeting and deterministic % rollouts. */
  user: UserContextInput;
  /** Poll cadence; default 30s. */
  pollIntervalMs?: number;
  /** Injectable for tests. */
  fetch?: typeof globalThis.fetch;
  /** Called on every failed refresh; the last fetched flags keep serving. */
  onError?: (error: Error) => void;
}

export class ToggleFlowBrowserClient {
  private current: FlagsSnapshot | null = null;
  private serialized: string | null = null;
  private user: UserContextInput;
  private readonly listeners = new Set<(flags: FlagsSnapshot) => void>();
  private readonly transport: UpdateTransport;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly readyPromise: Promise<void>;
  private resolveReady!: () => void;

  constructor(private readonly options: BrowserClientOptions) {
    this.user = options.user;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
    this.transport = createPollingTransport({
      intervalMs: options.pollIntervalMs ?? 30_000,
      tick: () => this.refresh(),
    });
    this.transport.start();
  }

  waitForReady(timeoutMs?: number): Promise<void> {
    if (timeoutMs === undefined) return this.readyPromise;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`ToggleFlow: no flags after ${timeoutMs}ms`)),
        timeoutMs,
      );
      void this.readyPromise.then(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  get ready(): boolean {
    return this.current !== null;
  }

  /** Switch users (login/logout) and refetch immediately. */
  identify(user: UserContextInput): Promise<void> {
    this.user = user;
    return this.transport.refreshNow();
  }

  getFlag(toolKey: string): EvaluatedFlag | undefined {
    return this.current?.flags[toolKey];
  }

  isEnabled(toolKey: string): boolean {
    return this.getFlag(toolKey)?.enabled ?? false;
  }

  getConfig(toolKey: string): JsonObject | null {
    return this.getFlag(toolKey)?.config ?? null;
  }

  getFallback(toolKey: string): JsonValue | null {
    return this.getFlag(toolKey)?.fallback ?? null;
  }

  allFlags(): Record<string, EvaluatedFlag> {
    return this.current?.flags ?? {};
  }

  /** Notifies whenever the evaluated flag set actually changes. Transport-agnostic. */
  subscribe(listener: (flags: FlagsSnapshot) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  refreshNow(): Promise<void> {
    return this.transport.refreshNow();
  }

  close(): void {
    this.transport.stop();
    this.listeners.clear();
  }

  private async refresh(): Promise<void> {
    try {
      const params = new URLSearchParams({
        environment: this.options.environmentId,
        user: this.user.key,
      });
      if (this.user.attributes && Object.keys(this.user.attributes).length > 0) {
        params.set('attributes', JSON.stringify(this.user.attributes));
      }
      const res = await this.fetchImpl(`${this.options.edgeUrl}/v1/flags?${params.toString()}`, {
        headers: { authorization: `Bearer ${this.options.clientKey}` },
      });
      if (!res.ok) throw new Error(`ToggleFlow: flags fetch failed with HTTP ${res.status}`);
      const payload = (await res.json()) as FlagsSnapshot;
      const serialized = JSON.stringify(payload);
      const changed = serialized !== this.serialized;
      this.current = payload;
      this.serialized = serialized;
      this.resolveReady();
      if (changed) {
        for (const listener of this.listeners) listener(payload);
      }
    } catch (err) {
      // Stale-if-error: keep the last evaluated flags.
      this.options.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }
}

export function createBrowserClient(options: BrowserClientOptions): ToggleFlowBrowserClient {
  return new ToggleFlowBrowserClient(options);
}
