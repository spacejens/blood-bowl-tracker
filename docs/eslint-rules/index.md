# eslint-rules

`tools/eslint-rules` holds the custom ESLint rules shared across the repo,
imported directly by the root `eslint.config.ts` under the `local/` prefix.

## Rules

- **`local/max-function-params`** — functions and methods take at most three
  parameters; constructors are exempt. See `CLAUDE.md`'s "Function parameter
  limit".
- **`local/no-direct-service-instantiation`** — spec files, e2e specs and
  `*.test-helpers.ts` modules may not `new` an injectable class; they build it
  through `Test.createTestingModule`. See `CLAUDE.md`'s "Testing services".
- **`local/no-test-helper-imports`** — production code may not import a
  `*.test-helpers.ts` module.

## Development

```bash
pnpm --filter @blood-bowl-tracker/eslint-rules run test    # unit tests with coverage
pnpm --filter @blood-bowl-tracker/eslint-rules run verify  # build + lint + typecheck + format + test
```
