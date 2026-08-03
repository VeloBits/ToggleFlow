import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { buildAuthContext, type AuthContext } from './auth/context';
import { createKeycloakVerifier, type TokenVerifier } from './auth/verifier';
import { createDb, type Db } from './db';
import { env } from './env';
import { HttpError, unauthorized } from './lib/errors';
import {
  createCloudflareKvClient,
  createMemoryKvClient,
  createMiniflareKvClient,
  type KvClient,
} from './lib/kv';
import { Publisher } from './lib/publish';
import { registerApiKeyRoutes } from './routes/api-keys';
import { registerAuditRoutes } from './routes/audit';
import { registerConfigRoutes } from './routes/configs';
import { registerFlagRoutes } from './routes/flags';
import { registerMeRoutes } from './routes/me';
import { registerMemberRoutes } from './routes/members';
import { registerOrgRoutes } from './routes/orgs';
import { registerProjectRoutes } from './routes/projects';
import { registerPublishRoutes } from './routes/publish';
import { registerSegmentRoutes } from './routes/segments';
import { registerToolRoutes } from './routes/tools';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    kv: KvClient;
    publisher: Publisher;
  }
  interface FastifyRequest {
    auth: AuthContext;
  }
}

export interface BuildServerOptions {
  /** Overrides for tests: database, token verifier, KV client, publish debounce. */
  databaseUrl?: string;
  verifier?: TokenVerifier;
  kv?: KvClient;
  publishDebounceMs?: number;
}

function createKvClientFromEnv(): KvClient {
  switch (env.kvMode) {
    case 'memory':
      return createMemoryKvClient();
    case 'miniflare':
      return createMiniflareKvClient({
        namespaceId: env.kvNamespaceId,
        persistPath: env.kvPersistPath,
      });
    case 'cloudflare': {
      if (!env.cloudflareAccountId || !env.cloudflareApiToken) {
        throw new Error(
          'KV_MODE=cloudflare requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN',
        );
      }
      return createCloudflareKvClient({
        accountId: env.cloudflareAccountId,
        namespaceId: env.kvNamespaceId,
        apiToken: env.cloudflareApiToken,
      });
    }
  }
}

export async function buildServer(opts: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : true,
  });

  await app.register(cors, { origin: true });

  app.decorate('db', createDb(opts.databaseUrl ?? env.databaseUrl));
  app.decorate('kv', opts.kv ?? createKvClientFromEnv());
  app.decorate(
    'publisher',
    new Publisher(app.db, app.kv, {
      debounceMs: opts.publishDebounceMs ?? env.publishDebounceMs,
      logger: app.log,
    }),
  );
  app.addHook('onClose', async () => {
    await app.publisher.close();
    await app.kv.close?.();
    await app.db.$client.end();
  });

  const verifier =
    opts.verifier ??
    createKeycloakVerifier({
      issuer: env.keycloakIssuer,
      audience: env.keycloakAudience,
      jwksIssuer: env.keycloakJwksIssuer,
    });

  // Everything under /v1/ requires a valid Keycloak bearer token; the user is
  // provisioned (and a personal org bootstrapped) on first sight of a subject.
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/v1/')) return;
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized('missing bearer token');
    const claims = await verifier(header.slice('Bearer '.length));
    req.auth = await buildAuthContext(app.db, claims);
  });

  app.setErrorHandler((err, req, reply) => {
    const raw = err as { code?: unknown; statusCode?: unknown; message?: string };
    if (err instanceof HttpError) {
      return reply.status(err.statusCode).send({ error: err.code, message: err.message });
    }
    if (err instanceof ZodError) {
      const issues = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return reply
        .status(400)
        .send({ error: 'validation_error', message: 'invalid request', issues });
    }
    // Postgres unique-constraint violations surface as 409s. Drizzle wraps
    // the PostgresError, so check the cause chain too.
    const cause = (err as { cause?: { code?: unknown } }).cause;
    if (raw.code === '23505' || cause?.code === '23505') {
      return reply.status(409).send({ error: 'conflict', message: 'resource already exists' });
    }
    if (typeof raw.statusCode === 'number' && raw.statusCode < 500) {
      return reply.status(raw.statusCode).send({ error: 'request_error', message: raw.message });
    }
    req.log.error(err);
    return reply.status(500).send({ error: 'internal_error', message: 'internal server error' });
  });

  app.get('/health', async () => ({ status: 'ok' }));

  registerMeRoutes(app);
  registerOrgRoutes(app);
  registerProjectRoutes(app);
  registerToolRoutes(app);
  registerFlagRoutes(app);
  registerSegmentRoutes(app);
  registerConfigRoutes(app);
  registerApiKeyRoutes(app);
  registerAuditRoutes(app);
  registerPublishRoutes(app);
  registerMemberRoutes(app);

  return app;
}
