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
