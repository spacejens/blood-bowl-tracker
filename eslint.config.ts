// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import { maxFunctionParams } from './tools/eslint-rules/src/max-function-params.ts';
import { noDirectServiceInstantiation } from './tools/eslint-rules/src/no-direct-service-instantiation.ts';

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
            'packages/api-server/test/*.ts',
            'packages/discord-client/test/*.ts',
            'packages/api-client/test/*.ts',
            'packages/import/test/*.ts',
            'packages/game-data/test/*.ts',
            'tools/import-bbl/test/*.ts',
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
    files: ['**/*.spec.ts', '**/*.test-helpers.ts'],
    rules: {
      'local/no-direct-service-instantiation': 'error',
    },
  },
);
