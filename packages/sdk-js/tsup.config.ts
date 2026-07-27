import { defineConfig } from 'tsup';

export default defineConfig({
  // Separate entries so React stays an optional peer dep behind the
  // `@toggleflow/sdk/react` subpath — importing the main entry never
  // touches React.
  entry: ['src/index.ts', 'src/react.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
});
