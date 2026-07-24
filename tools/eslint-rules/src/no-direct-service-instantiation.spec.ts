import { RuleTester } from 'eslint';

import { noDirectServiceInstantiation } from './no-direct-service-instantiation';

const ruleTester = new RuleTester();

const MESSAGE =
  'Do not instantiate services directly in tests. Build a TestingModule with mocked dependencies instead.';

describe('no-direct-service-instantiation', () => {
  ruleTester.run(
    'no-direct-service-instantiation',
    noDirectServiceInstantiation,
    {
      valid: [
        // Non-service classes are unaffected.
        { code: 'const m = new Map();' },
        { code: 'const e = new ExternalIdMap();' },
        { code: 'const d = new Date();' },
        { code: 'const err = new Error("boom");' },
        // A class merely *named* with Service inside is not a service suffix.
        { code: 'const s = new ServiceLocator();' },
        // Resolving a service through a testing module is the point of the rule.
        {
          code: 'const service = moduleRef.get(CoachesService);',
        },
        // A namespaced constructor is not an unqualified service identifier.
        { code: 'const s = new nest.CoachesService();' },
      ],
      invalid: [
        {
          code: 'const s = new CoachesService(db);',
          errors: [{ message: MESSAGE }],
        },
        {
          code: 'const s = new ImportRunnerService(new ImportResultService());',
          errors: [{ message: MESSAGE }, { message: MESSAGE }],
        },
        {
          code: 'function f() { return new LikePatternService(); }',
          errors: [{ message: MESSAGE }],
        },
      ],
    },
  );
});
