/**
 * Live e2e demo of the Phase 6 gate (run with tsx against the dev stack):
 *
 *   TF_ENV_ID=... TF_SERVER_KEY=... npx tsx demo/e2e-loop.ts
 *
 * 1. Boots a server client against the edge worker (poll: TF_POLL_MS, default 3s;
 *    production default is 30s).
 * 2. Logs every applied ruleset update - flip the flag via the API and watch
 *    it arrive within one poll interval.
 * 3. Kill the edge worker: errors are logged but evaluations keep serving
 *    from the cached ruleset (stale-if-error).
 */
import { createServerClient } from '../src/index';

const env =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

const edgeUrl = env.TF_EDGE_URL ?? 'http://localhost:8787';
const environmentId = env.TF_ENV_ID ?? '';
const serverKey = env.TF_SERVER_KEY ?? '';
const toolKey = env.TF_TOOL ?? 'tool.edge-demo';
const pollIntervalMs = Number(env.TF_POLL_MS ?? 3000);
const user = { key: 'demo-user', attributes: { plan: 'pro' } };

if (!environmentId || !serverKey) {
  console.error('set TF_ENV_ID and TF_SERVER_KEY');
  throw new Error('missing configuration');
}

const stamp = () => new Date().toISOString().slice(11, 23);

const client = createServerClient({
  edgeUrl,
  environmentId,
  serverKey,
  pollIntervalMs,
  onError: (err) => console.log(`[${stamp()}] ERROR ${err.message} - serving stale ruleset`),
});

client.subscribe(({ version }) => {
  console.log(
    `[${stamp()}] UPDATE ruleset v${version} → ${toolKey} enabled=${client.isEnabled(toolKey, user)}`,
  );
});

await client.waitForReady(10_000);
console.log(
  `[${stamp()}] READY ruleset v${client.getSnapshot()?.version} → ${toolKey} enabled=${client.isEnabled(toolKey, user)} (local eval, poll=${pollIntervalMs}ms)`,
);

setInterval(() => {
  console.log(
    `[${stamp()}] heartbeat ${toolKey} enabled=${client.isEnabled(toolKey, user)} (ruleset v${client.getSnapshot()?.version}, ready=${client.ready})`,
  );
}, 5000);
