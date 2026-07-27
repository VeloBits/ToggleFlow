import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  // Workers runtime: bundle everything (engine + zod) into one module — the
  // tests boot this exact bundle in workerd via miniflare. wrangler does its
  // own bundling from src/ for dev/deploy.
  platform: 'browser',
  target: 'es2022',
  noExternal: [/.*/],
  sourcemap: true,
  clean: true,
});
