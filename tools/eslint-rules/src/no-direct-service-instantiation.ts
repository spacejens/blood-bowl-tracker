import type { Rule } from 'eslint';

/**
 * Every `@Injectable()` class in this repo ends in one of these suffixes
 * (verified repo-wide). A suffix outside this list is not caught — see
 * the "Known limitation" note below.
 */
const INJECTABLE_SUFFIXES = [
  'Service',
  'Parser',
  'Processor',
  'Reader',
  'Middleware',
];

/**
 * Bans `new XService(...)` (and the other injectable-class suffixes below)
 * so service tests cannot regress to direct instantiation with hand-built
 * fakes. The repo standard (see `.superpowers/sdd/migration-conventions.md`)
 * is a `Test.createTestingModule` whose only real provider is the class
 * under test, with every injected dependency mocked via
 * `vitest-mock-extended`.
 *
 * Deliberately matches only an unqualified identifier whose name ends in one
 * of `INJECTABLE_SUFFIXES`: `new ServiceLocator()` and
 * `new nest.CoachesService()` are not what the convention is about, and value
 * objects like `ExternalIdMap` are legitimately constructed in tests. Same
 * exclusion for the bare suffix name itself (e.g. `new Reader()` is not
 * flagged) — only a prefixed class name is.
 *
 * Known limitation: this matches by class-name suffix only. A future
 * `@Injectable()` class named with a suffix outside `INJECTABLE_SUFFIXES`
 * (something other than Service/Parser/Processor/Reader/Middleware) would
 * not be caught — the rule is a suffix heuristic, not decorator-aware.
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
          INJECTABLE_SUFFIXES.some(
            (suffix) => callee.name.endsWith(suffix) && callee.name !== suffix,
          )
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
