# import-shared

`packages/import-shared` holds the pure, I/O-free import rules a bulk import
and a live import must apply identically. The client-side
[import](../import/index.md) package (and through it every `tools/import-*`)
and the server-side [import-tp-live](../import-tp-live/index.md) package both
depend on it, so a change here reaches bulk and live imports together.

## What it owns

- **`NameExternalIdService`** — the "Name" external-id formats.
- **`ImportResultService`** — `ImportError`/`ImportResult` construction, typed
  with `packages/api-contract`'s types.
- **`UpsertRecorderService`** — per-item upsert error recording.
- **`CompetitionTypeService`** — the at-most-three-days cup-versus-season span
  rule. `tools/import-bbl` classifies competitions through it, by way of
  `packages/import`'s re-export.

## Why the Name ids must be shared

The Name ids are identity-critical: if the bulk and live sides wrote different
strings, a live and a bulk import of the same coach, team or position would
create two rows.

## Dependencies

Its only workspace dependencies are `packages/api-contract` (types) and
`packages/domain-enums`. That keeps it usable from both sides of the
[client/server boundary](../architecture.md#clientserver-boundary), where it
is one of the deliberate two-sided packages.

## Development

```bash
pnpm --filter @blood-bowl-tracker/import-shared run test    # unit tests with coverage
pnpm --filter @blood-bowl-tracker/import-shared run verify  # build + lint + typecheck + format + test
```
