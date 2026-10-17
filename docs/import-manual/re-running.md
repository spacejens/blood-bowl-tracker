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

Both phases rename positions, so a position named in both
`races-and-positions.json5` and `position-availability.json5` must carry the
same name in both (see [curated files](curated-files.md)); otherwise each run
renames it back and forth.

## Nothing is deleted

A row a source system drops or re-keys stays, and is fixed by a data migration
or a once-applied manual batch, not by an entry here (see
[Re-running importers](../database.md#re-running-importers)).

## Tested

`test/importer-double-run.e2e-spec.ts` runs this tool's real before and after
phases with a small stand-in for the BBL and TP importers between them,
twice, against a real Postgres, and asserts the second run changes no row and
adds no history row. It needs Docker (`pnpm run test:e2e`; `pnpm run test`
runs it after the unit tests). The real BBL and TP pipelines are not part of
it: their source data is not in the repository. The harness leaves
`race_eras`, `positions_race_eras`, `era_rules_sets`, `matches`,
`match_events`, `player_skills`, `trophy_awards` and `competition_teams`
empty, so the comparison passes vacuously for them, and the position
availability race-era syncs fail there and are never exercised.
