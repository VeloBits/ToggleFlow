import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { resolveEnvironment } from '../auth/rbac';
import { writeAudit } from '../lib/audit';

const environmentParams = z.object({ environmentId: z.uuid() });

export function registerPublishRoutes(app: FastifyInstance): void {
  /**
   * Manual republish: force-rebuilds the ruleset AND the API-key hashes and
   * rewrites both KV entries even when content is unchanged - the recovery
   * path when KV was wiped or drifted (Postgres is the source of truth).
   */
  app.post('/v1/environments/:environmentId/publish', async (req) => {
    const { environmentId } = environmentParams.parse(req.params);
    const scope = await resolveEnvironment(app.db, req.auth, environmentId, 'developer');

    const ruleset = await app.publisher.publishRuleset(environmentId, { force: true });
    const keys = await app.publisher.publishKeys(environmentId);

    await writeAudit(app.db, {
      orgId: scope.orgId,
      actorId: req.auth.user.id,
      action: 'ruleset.republish',
      entityType: 'environment',
      entityId: environmentId,
      after: {
        version: ruleset.version ?? null,
        contentHash: ruleset.contentHash ?? null,
        serverKeys: keys.server,
        clientKeys: keys.client,
      },
    });
    return { ruleset, keys };
  });
}
