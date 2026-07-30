import { defineConfig } from 'tsup';

export default defineConfig({
  // migrate.ts and seed.ts ship alongside the server so the one-shot compose
  // services can reuse the production image — drizzle-kit and tsx are
  // devDependencies and are pruned out of it. tsup preserves the src/ tree shape,
  // so the outputs are dist/index.js, dist/scripts/migrate.js, dist/db/seed.js.
  entry: ['src/index.ts', 'src/scripts/migrate.ts', 'src/db/seed.ts'],
  format: ['esm'],
  target: 'node22',
  sourcemap: true,
  clean: true,
});
