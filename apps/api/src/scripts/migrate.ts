/**
 * Standalone migrator for containers and CI.
 *
 * Deliberately dependency-light: it uses drizzle-orm's programmatic migrator over
 * the committed SQL in apps/api/drizzle - the same path apps/api/test/helpers.ts
 * takes - so it needs neither drizzle-kit (a devDependency, pruned out of the
 * production image) nor drizzle.config.ts. `npm run db:migrate` stays the
 * bare-metal developer command; this is the one a prod-only-deps image can run.
 */
import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import { env } from '../env';

// Resolved from this module's own URL, not process.cwd(). '../../drizzle' lands on
// apps/api/drizzle from BOTH src/scripts/migrate.ts (tsx, dev image, cwd /app) and
// dist/scripts/migrate.js (production image, cwd /app/apps/api).
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

const client = postgres(env.databaseUrl, { max: 1 });
try {
  await migrate(drizzle(client), { migrationsFolder });
  console.log(`migrations applied from ${migrationsFolder}`);
} finally {
  await client.end();
}
