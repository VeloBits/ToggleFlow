import { defineConfig } from 'vitest/config';

/**
 * Root config for the MERGED coverage run (`npm run test:coverage`).
 *
 * `npm test` stays on turbo - it runs each workspace's own vitest in parallel
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
 * every package that lacks its own (engine, sdk-js, edge-worker) - which then
 * tries to resolve `projects` relative to itself and dies with "No projects
 * were found". The name keeps it out of auto-discovery; package.json passes it
 * explicitly via --config.
 */
export default defineConfig({
  test: {
    projects: ['apps/*', 'packages/*'],

    // apps/api's suites share one Postgres and TRUNCATE all 13 tables between
    // files. Under `projects` every suite lands in one pool, so this has to be
    // set here - apps/api/vitest.config.ts's copy is ignored in this mode.
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
        // real workerd via Miniflare - a separate process that in-process v8
        // instrumentation cannot see, so src/ reports a structural 0%. The
        // tests still run and still gate CI; only the denominator changes.
        // Measuring it for real means porting to @cloudflare/vitest-pool-workers.
        'apps/edge-worker/src/**',
        // Vendored shadcn primitives (`npx shadcn add`, style new-york): cva
        // variant maps, forwardRef pass-throughs and className merges whose
        // behaviour belongs to Radix and is tested upstream. Same category as
        // the edge-worker entry above - not the thing under test.
        //
        // They ARE rendered: every Flags suite drives the app through them.
        // What leaves the denominator is ~35 variant arms whose only possible
        // assertion is "did Tailwind emit this class string".
        //
        // This is safe because eslint.config.js forbids importing src/api/*,
        // @tanstack/react-query and react-router-dom inside the directory, so
        // nothing with a branch worth testing can live there. Widen the
        // exclusion only if that rule widens with it.
        'apps/dashboard/src/components/ui/**',
        // Type-only and non-executable.
        '**/*.d.ts',
        '**/*.css',
      ],

      /**
       * The 70% gate is monorepo-wide, so a well-covered package can carry a
       * weaker one. The per-package globs are no-regression floors, set a few
       * points below what each package measured when this landed - they do NOT
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

        // measured 89.9 / 77.5 / 90.0 / 93.7 (2026-08-03, typed flag values)
        'apps/api/src/**': { statements: 87, branches: 74, functions: 87, lines: 91 },
        /*
         * measured 94.5 / 91.1 / 92.1 / 95.5 (2026-08-03, Flags surface rebuild)
         *
         * Lower than the 96.4 / 95.3 / 95.3 / 97.5 recorded when these floors
         * landed, and deliberately NOT lowered to match: the drop is the cost of
         * roughly tripling this package's surface (the flags feature, the form,
         * the detail tabs), and every number still clears its floor. Functions
         * sits ~0.1pt above the line, so the floors stay where they are rather
         * than being raised - there is no headroom to spend.
         */
        'apps/dashboard/src/**': { statements: 92, branches: 90, functions: 92, lines: 94 },
        // measured 96.9 / 85.7 / 100 / 96.4 (2026-08-03; branches 74.3 -> 85.7
        // when the typed-value fixtures landed, so the branch floor moves up)
        'packages/engine/src/**': { statements: 94, branches: 80, functions: 95, lines: 94 },
        // measured 90.9 / 87.0 / 85.9 / 91.9 (2026-08-03, typed value accessors)
        'packages/sdk-js/src/**': { statements: 88, branches: 84, functions: 83, lines: 89 },
      },
    },
  },
});
