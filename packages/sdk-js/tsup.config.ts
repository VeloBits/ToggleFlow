import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
  // Separate entries so React stays an optional peer dep behind the
  // `@toggleflow/sdk/react` subpath - importing the main entry never
  // touches React.
  entry: ['src/index.ts', 'src/react.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  // Keep dist/ intact in watch mode so dependents' DTS builds never race a
  // startup wipe (same rationale as packages/engine).
  clean: !options.watch,
}));
