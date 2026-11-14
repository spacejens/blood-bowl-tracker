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
- **`JourneymanRuleService`** — the journeyman rule: a player named
  "Journeyman" in a basic position. A line-up sets the marker whenever its
  skills list Loner (`lonerListed: true`), even a snapshot taken before the
  player was recruited, and otherwise leaves it alone. A later roster that
  shows him without Loner, or renamed, clears it. A roster states the marker
  for a player named Journeyman in a basic position from whether it lists
  Loner, and leaves the stored marker alone when it cannot check
  (`lonerListed` undefined: a roster entry without a skills group, or no
  Loner skill ids to read it against); any other roster player is unmarked.
  Used by BBL, TP bulk and TP live.

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
