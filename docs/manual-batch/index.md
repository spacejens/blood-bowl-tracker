# manual-batch

`packages/manual-batch` holds the manual-import batch layout and the entry
schemas that more than one tool must agree on. The importer
(`tools/import-manual`), the planner (`tools/import-manual-planner-cli`) and
the review tools all read batches through it, so a change here reaches them
together.

## What it owns

- **The layout.** A manual-import data directory holds a `batches` directory
  (`MANUAL_BATCHES_DIR_NAME`) of `NNN-<slug>` directories, each holding
  `.json5` files.
- **`ManualBatchNameService`** — the naming rule: three digits, then a
  lowercase hyphenated slug. `parse` returns the number and slug or `null`;
  `format` builds a name and rejects a number over 999 or a malformed slug.
- **`ManualBatchLayoutService`** — the listings and the JSON5 reader. Each
  listing comes in two flavours because its callers have opposite needs:
  - The strict ones (`listBatches`, `listJson5Files`) are for the importer and
    the planner, which must refuse a malformed layout. An unreadable directory
    throws, a batch not named `NNN-<slug>` throws, and so do two batches
    sharing a number. Only directories count as batches and only plain files
    as `.json5` files.
  - The lenient ones (`listBatchDirsLenient`, `listJson5FilesLenient`) are for
    the review tools, which show what they can read. An unreadable directory
    lists as empty, every directory counts as a batch whatever its name, and
    any entry ending in `.json5` counts as a file.
  - `readJson5` parses comments and trailing commas and rejects a malformed
    file with `Failed to parse <path>: ...`.
- **The shared schemas.** `ExternalRefSchema`,
  `PositionRulesSetSkillRefSchema`, `IncompletePlayerFillEntrySchema` and
  `LastingInjuryRepairEntrySchema`, with their inferred types. The importer
  applies fill and repair entries and the planner writes them, so what an
  entry accepts is defined once.

## What stays in import-manual

The importer-specific entry schemas, the ledger, the content hash, pooling and
symlink handling stay in [import-manual](../import-manual/index.md).

## Dependencies

Its workspace dependencies are `packages/api-contract` and
`packages/domain-enums`. It is client side only.

## Development

```bash
pnpm --filter @blood-bowl-tracker/manual-batch run test    # unit tests with coverage
pnpm --filter @blood-bowl-tracker/manual-batch run verify  # build + lint + typecheck + format + test
```
