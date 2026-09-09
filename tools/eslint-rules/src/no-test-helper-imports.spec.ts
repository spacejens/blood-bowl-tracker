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
      // A specifier that merely ends with similar letters, but isn't a
      // test-helpers path segment, is not a false positive.
      {
        code: "import { thing } from './not-test-helpers';",
        filename: 'coaches.controller.ts',
      },
      // A spec file importing a package's test-helpers subpath export is
      // legitimate.
      {
        code: "import { mockDb } from '@blood-bowl-tracker/db/test-helpers';",
        filename: 'coaches.service.spec.ts',
      },
      // A file directly inside a package's top-level `test/` directory —
      // e.g. an e2e suite's global setup — is test-only, even though its own
      // name carries none of the *.spec/*.e2e-spec/*.test-helpers suffixes.
      {
        code: "import { startTestPostgresContainer } from '@blood-bowl-tracker/db/test-helpers';",
        filename: 'packages/game-data/test/global-setup.ts',
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
      // A production file importing a package's test-helpers subpath export
      // (a bare specifier, not a relative `.test-helpers` file) is caught
      // too.
      {
        code: "import { mockDb } from '@blood-bowl-tracker/db/test-helpers';",
        filename: 'coaches.service.ts',
        errors: [{ message: MESSAGE }],
      },
      // A file that merely has "test" somewhere in its path, but is not
      // directly inside a `test/` directory segment, is still production
      // code and still caught.
      {
        code: "import { mockDb } from '@blood-bowl-tracker/db/test-helpers';",
        filename: 'src/testing-utils.ts',
        errors: [{ message: MESSAGE }],
      },
      // A `test/` directory nested below a package's `src/`, rather than
      // sitting directly at the package's top level, is still production
      // code and still caught — the exemption is for
      // `packages|apps|tools/<name>/test/*.ts` only.
      {
        code: "import { mockDb } from '@blood-bowl-tracker/db/test-helpers';",
        filename: 'apps/discord-bot/src/test/helpers.ts',
        errors: [{ message: MESSAGE }],
      },
    ],
  });
});
