import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : true,
  });

  await app.register(cors, { origin: true });

  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}
