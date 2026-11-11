# config-loader

`packages/config-loader` is the source-agnostic JSON5 config-file loading
(`createConfigLoaderServiceBase`) behind every config-reading tool: read the
file, treat a missing file as an empty config, parse JSON5 with an error
naming the path, and validate against a caller-supplied top-level schema.

## Who uses it

- Every import tool's config service, via [import](../import/index.md)'s
  `createImportConfigServiceBase`.
- `tools/download-tp` and `tools/backup-cli` directly.
- The review tools, via [review-harness](../review-harness/index.md)'s
  `createReviewConfigServiceBase`, a factory over
  `createConfigLoaderServiceBase` in the same shape as `packages/import`'s,
  which layers review-specific accessors on top.

Both wrapping factories, and this base, are class factories under
`CLAUDE.md`'s "Service vs. loose function" case 5.

## Rules

- **How, not what.** The package knows nothing about what a config file
  contains: each caller supplies its own top-level schema, DI path token and
  getters. A change here changes _how_ config files are read for every
  config-reading tool at once; it never defines _what_ any of them accepts.
- **No workspace dependencies.** It deliberately depends on no other
  workspace package, keeping the `tools/* → packages/*` direction intact.

## Development

```bash
pnpm --filter @blood-bowl-tracker/config-loader run test    # unit tests with coverage
pnpm --filter @blood-bowl-tracker/config-loader run verify  # build + lint + typecheck + format + test
```
