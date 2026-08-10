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
   * The icon set is @velobits-dev/icons: hand-drawn on a 24x24 grid and tuned
   * for the 13-18px this dashboard renders at, where Lucide's glyphs lose their
   * read. Nothing here imports lucide-react any more, and this rule is what
   * keeps it that way.
   *
   * The other three names below are the local UI layer the design system
   * replaced. They are listed by name because a stale import of any of them
   * fails at build time with a module-not-found that says nothing about where
   * the component went.
   */
  {
    files: ['apps/dashboard/src/**/*.{ts,tsx}', 'apps/dashboard/test/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'lucide-react',
              message: 'Icons come from @velobits-dev/icons, which is tuned for 13-18px rendering.',
            },
          ],
          patterns: [
            {
              group: [
                '**/components/ui/*',
                '@/components/ui/*',
                '**/ui/icons',
                '@/ui/icons',
                '**/ui/dialog',
                '@/ui/dialog',
                '**/ui/side-panel',
                '@/ui/side-panel',
                '**/ui/menu',
                '@/ui/menu',
                '**/ui/segmented-control',
                '@/ui/segmented-control',
                '**/ui/theme',
                '@/ui/theme',
              ],
              message:
                'That module was replaced by the design system. Import it from @velobits-dev/ui or @velobits-dev/icons instead (Menu* is DropdownMenu*, and ui/theme is useTheme).',
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
