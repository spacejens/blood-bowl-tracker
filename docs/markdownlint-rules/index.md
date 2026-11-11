# markdownlint-rules

`tools/markdownlint-rules` holds the custom markdownlint rules shared across
the repo. They are built to `dist/` and loaded by the root
`.markdownlint-cli2.jsonc`'s `customRules`, so `pnpm lint:markdown` (and
therefore `pnpm lint` and `pnpm verify`) builds this package first.

## Rules

- **`max-file-lines`** — flags any markdown file over 500 lines, counting
  every raw line including blanks, matching `eslint.config.ts`'s `max-lines`
  ceiling for TypeScript source files. When a doc grows past it, split it into
  topic pages; see `CLAUDE.md`'s "Maximum file size".

## Development

```bash
pnpm --filter @blood-bowl-tracker/markdownlint-rules run test    # unit tests with coverage
pnpm --filter @blood-bowl-tracker/markdownlint-rules run verify  # build + lint + typecheck + format + test
```
