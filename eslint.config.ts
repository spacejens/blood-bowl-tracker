// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import { maxFunctionParams } from './tools/eslint-rules/src/max-function-params.ts';
import { noDirectServiceInstantiation } from './tools/eslint-rules/src/no-direct-service-instantiation.ts';
import { noTestHelperImports } from './tools/eslint-rules/src/no-test-helper-imports.ts';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', 'eslint.config.ts'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.vitest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            'apps/discord-bot/test/*.ts',
            'apps/discord-bot/vitest.config.ts',
            'packages/api-client/test/*.ts',
            'packages/api-client/vitest.config.ts',
            'packages/api-contract/vitest.config.ts',
            'packages/api-server/test/*.ts',
            'packages/api-server/vitest.config.ts',
            'packages/db/drizzle.config.ts',
            'packages/db/vitest.config.ts',
            'packages/discord-client/test/*.ts',
            'packages/discord-client/vitest.config.ts',
            'packages/game-data/test/*.ts',
            'packages/game-data/vitest.config.ts',
            'packages/import/test/*.ts',
            'packages/import/vitest.config.ts',
            'packages/parse-tp/test/*.ts',
            'packages/parse-tp/vitest.config.ts',
            'packages/review-harness/test/*.ts',
            'packages/review-harness/vitest.config.ts',
            'tools/download-tp/test/*.ts',
            'tools/download-tp/vitest.config.ts',
            'tools/eslint-rules/vitest.config.ts',
            'tools/ai-helpers/test/*.ts',
            'tools/ai-helpers/vitest.config.ts',
            'tools/import-bbl/test/*.ts',
            'tools/import-bbl/vitest.config.ts',
            'tools/import-manual/test/*.ts',
            'tools/import-manual/vitest.config.ts',
            'tools/import-tp/test/*.ts',
            'tools/import-tp/vitest.config.ts',
            'tools/review-match/test/*.ts',
            'tools/review-match/vitest.config.ts',
            'tools/review-player/test/*.ts',
            'tools/review-player/vitest.config.ts',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
      local: {
        rules: {
          'max-function-params': maxFunctionParams,
          'no-direct-service-instantiation': noDirectServiceInstantiation,
          'no-test-helper-imports': noTestHelperImports,
        },
      },
    },
    rules: {
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'local/max-function-params': ['error', { max: 3 }],
      'local/no-test-helper-imports': 'error',
    },
  },
  {
    files: ['**/*.ts'],
    ignores: [
      '**/*.spec.ts',
      '**/*.e2e-spec.ts',
      'apps/discord-bot/src/insights/fact-tree.ts',
    ],
    rules: {
      'max-lines': [
        'error',
        { max: 500, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
    rules: {
      'max-lines': [
        'error',
        { max: 1000, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', '**/*.test-helpers.ts'],
    rules: {
      'local/no-direct-service-instantiation': 'error',
      // Asserting on a mock method reference (e.g.
      // `expect(mock.method).toHaveBeenCalledWith(...)`) trips unbound-method,
      // which only matters for real, `this`-bound methods — never for mocks.
      '@typescript-eslint/unbound-method': 'off',
    },
  },
);
