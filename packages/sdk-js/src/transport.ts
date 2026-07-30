/**
 * Update-delivery abstraction (brief §8). Clients only ever expose
 * `subscribe()` / `waitForReady()` / `close()` - HOW updates arrive is an
 * internal transport. Today that is ETag polling; an SSE/streaming transport
 * implements the same interface and slots in WITHOUT any public API change.
 */
export type Unsubscribe = () => void;

export interface UpdateTransport {
  start(): void;
  stop(): void;
  /** Run one refresh cycle immediately (manual refresh, identify()). */
  refreshNow(): Promise<void>;
}

export interface PollingOptions {
  intervalMs: number;
  /** One refresh cycle. Must handle its own errors - the transport only drives cadence. */
  tick(): Promise<void>;
}

export function createPollingTransport(options: PollingOptions): UpdateTransport {
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = () => {
    if (!running) return;
    timer = setTimeout(run, options.intervalMs);
    // Never keep a Node process alive just for polling.
    (timer as unknown as { unref?: () => void }).unref?.();
  };
  const run = () => {
    void options.tick().finally(schedule);
  };

  return {
    start() {
      if (running) return;
      running = true;
      run();
    },
    stop() {
      running = false;
      if (timer !== undefined) clearTimeout(timer);
    },
    refreshNow() {
      return options.tick();
    },
  };
}
