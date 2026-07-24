import type { Rule } from 'eslint';

/**
 * Matches a module source ending in `.test-helpers`, `.test-helpers.js`, or
 * `.test-helpers.ts`. Imports in this repo are typically extensionless
 * relative specifiers (e.g. `'./foo-mock.test-helpers'`), but the suffixed
 * forms are handled too.
 */
const TEST_HELPER_SOURCE = /\.test-helpers(\.[jt]s)?$/;

/**
 * A file is itself a test file — and therefore allowed to import test
 * helpers — if it is a `*.spec.ts`, `*.e2e-spec.ts`, or `*.test-helpers.ts`
 * file.
 */
const TEST_FILE = /\.(spec|e2e-spec|test-helpers)\.ts$/;

const MESSAGE =
  'Test helpers (*.test-helpers.ts) are test-only and must not be imported by production code. Move the logic into a real module if production needs it.';

/**
 * Forbids production (non-test) code from importing `*.test-helpers.ts`
 * modules. Test helpers are excluded from coverage and meant only for use by
 * `*.spec.ts` / `*.e2e-spec.ts` files (and other test helpers); production
 * code depending on them would smuggle test-only logic into the real build.
 *
 * Deliberately self-aware via `context.filename`: it skips reporting when the
 * importing file is itself a test file, rather than relying on
 * `eslint.config.ts` file-glob scoping. This is more robust than a glob-based
 * approach — the rule stays correct even if it were ever registered globally
 * or the config's file globs drifted out of sync with the test-file naming
 * convention.
 *
 * Covers static `import ... from '...'`, `export ... from '...'`, and
 * `export * from '...'` — the cases that matter for this repo, which does not
 * use `require(...)` or dynamic `import(...)` for its own modules.
 */
export const noTestHelperImports: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'forbid production code from importing *.test-helpers.ts modules',
    },
    schema: [],
  },
  create(context) {
    if (TEST_FILE.test(context.filename)) {
      return {};
    }
    function check(node: Rule.Node & { source?: { value?: unknown } | null }) {
      const source = node.source;
      if (
        source &&
        typeof source.value === 'string' &&
        TEST_HELPER_SOURCE.test(source.value)
      ) {
        context.report({ node, message: MESSAGE });
      }
    }
    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
    };
  },
};
