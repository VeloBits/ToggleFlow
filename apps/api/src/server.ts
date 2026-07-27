import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { buildAuthContext, type AuthContext } from './auth/context';
import { createKeycloakVerifier, type TokenVerifier } from './auth/verifier';
import { createDb, type Db } from './db';
import { env } from './env';
import { HttpError, unauthorized } from './lib/errors';
import { registerApiKeyRoutes } from './routes/api-keys';
import { registerAuditRoutes } from './routes/audit';
import { registerConfigRoutes } from './routes/configs';
import { registerFlagRoutes } from './routes/flags';
import { registerMeRoutes } from './routes/me';
import { registerProjectRoutes } from './routes/projects';
import { registerSegmentRoutes } from './routes/segments';
import { registerToolRoutes } from './routes/tools';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
  }
  interface FastifyRequest {
    auth: AuthContext;
  }
}

export interface BuildServerOptions {
  /** Overrides for tests: point at another database or inject a local token verifier. */
  databaseUrl?: string;
  verifier?: TokenVerifier;
}

export async function buildServer(opts: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : true,
  });

  await app.register(cors, { origin: true });

  app.decorate('db', createDb(opts.databaseUrl ?? env.databaseUrl));
  app.addHook('onClose', async () => {
    await app.db.$client.end();
  });

  const verifier =
    opts.verifier ??
    createKeycloakVerifier({ issuer: env.keycloakIssuer, audience: env.keycloakAudience });

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
  registerProjectRoutes(app);
  registerToolRoutes(app);
  registerFlagRoutes(app);
  registerSegmentRoutes(app);
  registerConfigRoutes(app);
  registerApiKeyRoutes(app);
  registerAuditRoutes(app);

  return app;
}
