import { RuleTester } from 'eslint';

import { maxFunctionParams } from './max-function-params';

const ruleTester = new RuleTester();

const MESSAGE =
  'Functions should take at most 3 parameters. Use a named options object for more.';

describe('max-function-params', () => {
  ruleTester.run('max-function-params', maxFunctionParams, {
    valid: [
      // At the limit (3) is allowed.
      {
        code: 'function f(a, b, c) { return a + b + c; }',
        options: [{ max: 3 }],
      },
      // Under the limit is allowed.
      { code: 'const g = (a, b) => a + b;', options: [{ max: 3 }] },
      // Default max is 3 when no options are supplied.
      { code: 'function h(a, b, c) { return a; }' },
      // A constructor over the limit is exempt.
      {
        code: 'class C { constructor(a, b, c, d) { this.a = a; } }',
        options: [{ max: 3 }],
      },
    ],
    invalid: [
      // Function declaration over the limit.
      {
        code: 'function f(a, b, c, d) { return a; }',
        options: [{ max: 3 }],
        errors: [{ message: MESSAGE }],
      },
      // Arrow function over the limit.
      {
        code: 'const g = (a, b, c, d) => a;',
        options: [{ max: 3 }],
        errors: [{ message: MESSAGE }],
      },
      // Function expression over the limit.
      {
        code: 'const h = function (a, b, c, d) { return a; };',
        options: [{ max: 3 }],
        errors: [{ message: MESSAGE }],
      },
      // Default max (no options) still flags a 4-param function.
      {
        code: 'function k(a, b, c, d) { return a; }',
        errors: [{ message: MESSAGE }],
      },
    ],
  });
});
