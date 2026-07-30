import { env } from './env';
import { buildServer } from './server';

const app = await buildServer();

// Containers stop with SIGTERM. Without a handler, `docker stop` SIGKILLs after
// its grace period and the onClose hook in server.ts never runs - leaving the
// publisher undrained, miniflare's workerd child orphaned (and its KV store
// possibly locked), and the Postgres pool abandoned.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'shutting down');
    void app.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
}

try {
  await app.listen({ port: env.port, host: env.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
