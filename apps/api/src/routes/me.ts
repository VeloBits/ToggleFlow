import { inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { orgs } from '../db/schema';

export function registerMeRoutes(app: FastifyInstance): void {
  app.get('/v1/me', async (req) => {
    const { user, roles } = req.auth;
    const orgIds = [...roles.keys()];
    const orgRows = orgIds.length
      ? await app.db.select().from(orgs).where(inArray(orgs.id, orgIds))
      : [];
    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
      orgs: orgRows.map((org) => ({ id: org.id, name: org.name, role: roles.get(org.id) })),
    };
  });
}
