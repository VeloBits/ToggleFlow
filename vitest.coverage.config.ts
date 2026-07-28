import { defineConfig } from 'vitest/config';

/**
 * Root config for the MERGED coverage run (`npm run test:coverage`).
 *
 * `npm test` stays on turbo — it runs each workspace's own vitest in parallel
 * and is the fast dev loop. This config exists because coverage thresholds only
 * mean something across the whole monorepo: `packages/engine` sitting at 95%
 * should be allowed to offset the dashboard, which a per-package gate cannot
 * express. Vitest's `projects` runs every suite in one process so v8 emits a
 * single merged report.
 *
 * Each entry below is a directory, so the package's own config still applies
 * (apps/dashboard's react + tailwind plugins, the happy-dom pragmas, etc.).
 *
 * NOT named vitest.config.ts on purpose. Vitest walks UP from a package
 * directory looking for a config, so a root `vitest.config.ts` is inherited by
 * every package that lacks its own (engine, sdk-js, edge-worker) — which then
 * tries to resolve `projects` relative to itself and dies with "No projects
 * were found". The name keeps it out of auto-discovery; package.json passes it
 * explicitly via --config.
 */
export default defineConfig({
  test: {
    projects: ['apps/*', 'packages/*'],

    // apps/api's suites share one Postgres and TRUNCATE all 13 tables between
    // files. Under `projects` every suite lands in one pool, so this has to be
    // set here — apps/api/vitest.config.ts's copy is ignored in this mode.
    // Costs ~30s of wall clock and buys determinism.
    fileParallelism: false,

    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'json-summary', 'html'],

      // Only first-party source. Without an explicit include, v8 also reports
      // every test helper and config file, which inflates the numerator.
      include: ['apps/*/src/**', 'packages/*/src/**'],

      exclude: [
        // apps/edge-worker's 28 tests boot the BUILT bundle (dist/index.js) in
        // real workerd via Miniflare — a separate process that in-process v8
        // instrumentation cannot see, so src/ reports a structural 0%. The
        // tests still run and still gate CI; only the denominator changes.
        // Measuring it for real means porting to @cloudflare/vitest-pool-workers.
        'apps/edge-worker/src/**',
        // Type-only and non-executable.
        '**/*.d.ts',
        '**/*.css',
      ],

      /**
       * The 70% gate is monorepo-wide, so a well-covered package can carry a
       * weaker one. The per-package globs are no-regression floors, set a few
       * points below what each package measured when this landed — they do NOT
       * replace the global numbers (glob-matched files stay in the overall
       * calculation), they stop one package quietly rotting behind the average.
       *
       * Raise a floor when a package improves; never lower one to make a red
       * build green.
       */
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,

        // measured 89.2 / 75.6 / 88.5 / 93.0
        'apps/api/src/**': { statements: 85, branches: 72, functions: 85, lines: 88 },
        // measured 96.4 / 95.3 / 95.3 / 97.5
        'apps/dashboard/src/**': { statements: 92, branches: 90, functions: 92, lines: 94 },
        // measured 95.5 / 74.3 / 100 / 94.9
        'packages/engine/src/**': { statements: 92, branches: 72, functions: 95, lines: 92 },
        // measured 90.2 / 85.2 / 84.1 / 91.2
        'packages/sdk-js/src/**': { statements: 87, branches: 82, functions: 80, lines: 88 },
      },
    },
  },
});
