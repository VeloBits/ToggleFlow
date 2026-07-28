import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  // Keep dist/ intact in watch mode — dependents (sdk-js) resolve types from
  // dist/index.d.ts, and a startup wipe races their DTS build.
  clean: !options.watch,
}));
