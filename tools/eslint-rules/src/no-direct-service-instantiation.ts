import type { Rule } from 'eslint';

/**
 * Bans `new XService(...)` so service tests cannot regress to direct
 * instantiation with hand-built fakes. The repo standard (see
 * `.superpowers/sdd/migration-conventions.md`, and GitHub issue #268) is a
 * `Test.createTestingModule` whose only real provider is the service under
 * test, with every injected dependency mocked via `vitest-mock-extended`.
 *
 * Deliberately matches only an unqualified identifier whose name ends in
 * "Service": `new ServiceLocator()` and `new nest.CoachesService()` are not
 * what the convention is about, and value objects like `ExternalIdMap` are
 * legitimately constructed in tests.
 *
 * Known limitation: this matches by class-name suffix only. `@Injectable()`
 * classes named with other suffixes (e.g. `Parser`, `Reader`) are not
 * caught. Broadening the suffix list is a separate scope decision — see the
 * Task 18 report.
 */
export const noDirectServiceInstantiation: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'forbid direct instantiation of services in tests; use a TestingModule',
    },
    schema: [],
  },
  create(context) {
    return {
      NewExpression(node) {
        const callee = node.callee;
        if (
          callee.type === 'Identifier' &&
          callee.name.endsWith('Service') &&
          callee.name !== 'Service'
        ) {
          context.report({
            node,
            message:
              'Do not instantiate services directly in tests. Build a TestingModule with mocked dependencies instead.',
          });
        }
      },
    };
  },
};
