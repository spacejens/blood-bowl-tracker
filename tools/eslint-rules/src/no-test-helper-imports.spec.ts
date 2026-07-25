import { RuleTester } from 'eslint';

import { noTestHelperImports } from './no-test-helper-imports';

const ruleTester = new RuleTester();

const MESSAGE =
  'Test helpers (*.test-helpers.ts) are test-only and must not be imported by production code. Move the logic into a real module if production needs it.';

describe('no-test-helper-imports', () => {
  ruleTester.run('no-test-helper-imports', noTestHelperImports, {
    valid: [
      // A production file importing a normal module is unaffected.
      {
        code: "import { CoachesService } from './coaches.service';",
        filename: 'coaches.controller.ts',
      },
      // A spec file importing a test helper is legitimate.
      {
        code: "import { buildMockCoach } from './coach-mock.test-helpers';",
        filename: 'coaches.service.spec.ts',
      },
      // An e2e-spec file importing a test helper is legitimate.
      {
        code: "import { buildMockCoach } from './coach-mock.test-helpers';",
        filename: 'coaches.e2e-spec.ts',
      },
      // A test-helpers file importing another test helper is legitimate.
      {
        code: "import { buildMockCoach } from './coach-mock.test-helpers';",
        filename: 'coach-fixture.test-helpers.ts',
      },
      // A production file re-exporting a normal module is unaffected.
      {
        code: "export { CoachesService } from './coaches.service';",
        filename: 'coaches.controller.ts',
      },
    ],
    invalid: [
      // A production file importing a test helper is exactly what the rule
      // exists to catch.
      {
        code: "import { buildMockCoach } from './coach-mock.test-helpers';",
        filename: 'coaches.service.ts',
        errors: [{ message: MESSAGE }],
      },
      // Extension-suffixed specifiers are also caught.
      {
        code: "import { buildMockCoach } from './coach-mock.test-helpers.js';",
        filename: 'coaches.service.ts',
        errors: [{ message: MESSAGE }],
      },
      {
        code: "import { buildMockCoach } from './coach-mock.test-helpers.ts';",
        filename: 'coaches.service.ts',
        errors: [{ message: MESSAGE }],
      },
      // `export ... from` and `export * from` are caught too.
      {
        code: "export { buildMockCoach } from './coach-mock.test-helpers';",
        filename: 'coaches.service.ts',
        errors: [{ message: MESSAGE }],
      },
      {
        code: "export * from './coach-mock.test-helpers';",
        filename: 'coaches.service.ts',
        errors: [{ message: MESSAGE }],
      },
    ],
  });
});
