# Re-running on a populated database

The tool runs against a database that is never dropped, as do the BBL, TP and
live TP importers.

## Curated names

Every coach, competition, skill, position, team and race entry is sent with
`renameExisting: true`, so its `name` renames an existing row. The BBL, TP and
live TP importers never send it: they set those names only when they create
the row, so a later run of theirs cannot undo a curated name, not even
briefly (see
[Upserts overlay](../api/imports.md#upserts-overlay-they-do-not-replace)).
A fresh import therefore also ends with the curated name.

Batches 001 and 002 both rename positions, so a position named in both
`races-and-positions.json5` (batch 001) and `position-availability.json5`
(batch 002) must carry the same name in both (see
[curated files](curated-files.md)); otherwise each run renames it back and
forth. Batch 003 restates the same name again.

## Applied once

On a long-lived database each batch is applied once and recorded (see
[Batches](batches.md)); `apply` applies only batches added since the
last run. Re-applying a recorded batch by passing its directory is still
safe — every write is an upsert, and an unchanged re-run writes nothing —
but is never needed.

## Nothing is deleted

A row a source system drops or re-keys stays, and is fixed by a data migration
or a once-applied manual batch, not by an entry here (see
[Re-running importers](../database.md#re-running-importers)).

## Tested

`test/importer-double-run.e2e-spec.ts` runs this tool's `apply 001-initial-seed` and
plain `apply` commands with a small stand-in for the BBL and TP importers
between them, twice, against a real Postgres, and asserts the second run
applies no batch, records no new batch, changes no row and adds no history
row. Batch 002 always fails in the harness, since it references rows only the
real source importers create, so the batches numbered above it are run by
directory. It needs Docker (`pnpm run test:e2e`; `pnpm run test`
runs it after the unit tests). The real BBL and TP pipelines are not part of
it: their source data is not in the repository. The harness leaves
`race_eras`, `positions_race_eras`, `era_rules_sets`, `matches`,
`match_events`, `player_advancements`, `trophy_awards` and `competition_teams`
empty, so the comparison passes vacuously for them, and the position
availability race-era syncs fail there and are never exercised.
