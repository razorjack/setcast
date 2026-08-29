import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: {
    singleQuote: true,
    printWidth: 100,
    ignorePatterns: ['**/*.md'],
  },
  lint: {
    ignorePatterns: ['dist/**', 'examples/*/out/**'],
    plugins: ['typescript', 'react', 'import'],
    options: { typeAware: true, typeCheck: true },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['remotion', 'remotion/*', '@remotion/*'],
              message:
                'Only packages/renderer-remotion may import Remotion. Use the Setcast RenderFrame contract (@setcast/core/react hooks) instead. See AGENTS.md → Renderer independence.',
            },
          ],
        },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      complexity: ['error', { max: 15 }],
      'max-depth': ['error', { max: 3 }],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
      'max-nested-callbacks': ['error', { max: 3 }],
      'max-params': ['error', { max: 4 }],
      'no-else-return': ['error', { allowElseIf: false }],
      'no-nested-ternary': 'error',
      'typescript/no-explicit-any': 'error',
      'react/rules-of-hooks': 'error',
      'react/exhaustive-deps': 'error',
    },
    overrides: [
      {
        files: ['packages/renderer-remotion/**'],
        rules: { 'no-restricted-imports': 'off' },
      },
      {
        files: ['packages/cli/**', 'scripts/**'],
        rules: { 'no-console': 'off' },
      },
      {
        files: ['**/*.test.{ts,tsx}'],
        rules: {
          complexity: 'off',
          'max-lines-per-function': 'off',
        },
      },
    ],
  },
  test: {
    include: ['packages/*/src/**/*.test.{ts,tsx}'],
  },
  run: {
    tasks: {
      smoke: {
        command: 'node scripts/smoke.ts',
        cache: false,
      },
      'ban-check': {
        command: 'node scripts/check-remotion-ban.ts',
        cache: false,
      },
      'demo-assets': {
        command: 'node scripts/make-demo-assets.ts',
        cache: false,
      },
    },
  },
});
