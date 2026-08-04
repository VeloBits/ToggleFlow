import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/.wrangler/**',
      '**/coverage/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['apps/dashboard/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
    languageOptions: {
      globals: globals.browser,
    },
  },
  /*
   * The app icon set is hand-drawn (apps/dashboard/src/ui/icons.tsx) because
   * Lucide's glyphs lose their read at the 13-18px this dashboard renders at -
   * each icon's docblock records the measured departure. lucide-react is
   * installed only because the vendored shadcn primitives import it.
   */
  {
    files: ['apps/dashboard/src/**/*.{ts,tsx}'],
    ignores: ['apps/dashboard/src/components/ui/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'lucide-react',
              message:
                'App icons come from src/ui/icons.tsx (tuned for 13-18px). lucide-react is only for the vendored shadcn primitives in src/components/ui/.',
            },
          ],
        },
      ],
    },
  },
  /*
   * src/components/ui/ is excluded from the coverage thresholds in
   * vitest.coverage.config.ts on the grounds that it holds no logic worth
   * asserting. This rule is what makes that true rather than merely claimed:
   * data fetching, routing and app types cannot be imported here, so the
   * exclusion can never be used to hide a branch.
   */
  {
    files: ['apps/dashboard/src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/api/*', '@/api/*', '@tanstack/react-query', 'react-router-dom'],
              message:
                'Presentational primitives only. Anything that fetches, routes or knows an app type belongs in src/features/ or src/components/, which are coverage-gated.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
);
