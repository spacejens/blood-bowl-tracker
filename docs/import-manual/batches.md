# Batches

`tools/import-manual`'s curated data lives in numbered batches under
`tools/import-manual/data/batches/`. Each batch is applied to a database once
and then kept unchanged as a historical record; the database records which
batches it holds. A full import from scratch applies every batch, in order,
around the BBL and TP importers.

## Layout

```text
tools/import-manual/data/batches/
  001-before-initial-sources/
  002-after-initial-sources/
  003-after-reset-curated-names/
```

A batch directory is named `NNN-<phase>-<slug>`: a three-digit number, the
phase, and a lowercase hyphenated slug.

- `before` batches run before the BBL and TP importers, so the records they
  pre-register already exist for those importers to match; `after` batches
  run after them.
- Numbers order the batches and must be unique, and every `before` batch must
  be numbered below every `after` batch. Since batch 002 is an `after` batch,
  every new batch is an `after` batch.
- Within a batch, every `.json5` file directly in the directory is read in
  alphabetical order and pooled exactly as described in
  [Data files](index.md#data-files).

The initial batches:

- **001-before-initial-sources** and **002-after-initial-sources** — the
  curated data as it stood when batches were introduced, before and after the
  source importers. What each file is for is described in
  [Curated data files](curated-files.md).
- **003-after-reset-curated-names** — restates, with only `name` and
  `externalIds`, the curated name of every coach, team, race, position,
  competition and skill batches 001 and 002 curate. A long-lived database can
  carry a source's spelling for a row whose curated name came later (TP's
  "Gyttjevrålarna FC" for the team curated as "Gyttjevrålarna", BBL's
  "Bretonnians" for the race curated as "Bretonnian"); this batch puts each
  row on the name a fresh import ends with. On a fresh import it changes
  nothing. `curated-data-batch-003.spec.ts` keeps it in step with batches 001
  and 002.

## Changing curated data

Never edit an applied batch — not even to fix a typo. Put the change in a new
batch with the next free number (an `after` batch), restating only what
changes; an entry overlays the existing row (see
[Data files](index.md#data-files)). The importer refuses to run when an
applied batch's content no longer matches what was recorded, and when a
recorded batch has been renamed or removed.

Editing comments or formatting in an applied batch is harmless: the recorded
content hash is computed over the parsed content (SHA-256 of its canonical
JSON, object keys sorted, empty sections dropped, schema defaults left out),
so only a change to a value or to the order of entries changes it.

## Tracking

The `game_data.manual_import_batches` table records each applied batch's
name, content hash and when it was applied. The tool reads and writes it only
through the API (`manualImportBatches.list` / `.record`; see
[RPC conventions](../api/rpc-conventions.md)), never the database directly.
A database restored from a backup brings its ledger with it; a dropped and
recreated database starts with an empty one.

## Commands

Run from `tools/import-manual/` after building the tool
(`pnpm --filter @blood-bowl-tracker/import-manual run build`):

```bash
node dist/main.js before-sources                 # apply unapplied before batches
node dist/main.js after-sources                  # apply unapplied after batches
node dist/main.js mark-applied <batch>...        # record batches without importing
node dist/main.js <directory>                    # ad hoc import, records nothing
```

`before-sources` and `after-sources` read the tool's own `data/batches/`
whatever the working directory. Each:

1. checks every recorded batch, of both phases, still exists with the content
   it was recorded with, and fails otherwise;
2. for `after-sources`, fails while any `before` batch is unrecorded (run
   `before-sources` first on a fresh database, or `mark-applied` on one that
   already holds those batches);
3. imports each unrecorded batch of its phase in number order, printing
   `Skipped batch <name> (already applied).` or `Applied batch <name>.`;
4. records a batch only when it imported with zero errors. The first batch
   with errors is left unrecorded and no later batch is attempted, since later
   batches may depend on it; fix the cause and run the command again — every
   write is an idempotent upsert, so re-importing the batch is safe.

On success the last line is `Imported <N> record(s) successfully.`; collected
errors are printed one per line under `Import completed with <N> errors:`,
followed by which batch was left unrecorded, and the tool exits non-zero. An
unexpected failure (unreachable API, malformed file, a changed applied batch,
an invalid batch name) is printed as `Import failed:`.

`mark-applied` records the named batches with their current content hashes
without importing anything, for a database that already holds their data. A
batch already recorded with the same content is reported and left alone.

Passing a directory instead imports that directory ad hoc and records nothing
— useful for trying out data before it becomes a batch.

## Operating procedure

- **Scratch database:** `before-sources`, the BBL importer, the TP importer,
  `after-sources`.
- **Long-lived database (production):** `after-sources` only. It applies just
  the batches added since the last run.
- **Once, on a database that already holds the initial batches** (production,
  imported before batches existed): `mark-applied 001-before-initial-sources
  002-after-initial-sources`, then `after-sources` to apply batch 003. The
  api-server must already run a release with the `manualImportBatches`
  procedures (see [production imports](../discord-bot/production-imports.md)).

## Tested

`test/importer-double-run.e2e-spec.ts` runs `before-sources`, a BBL/TP
stand-in and `after-sources` twice against a real Postgres. Without the real
source importers batch 002 always fails on its references to rows only they
create, so `after-sources` stops there; the later after batches are then run
by directory so their content still takes part. The suite asserts the second
`before-sources` applies nothing, `manual_import_batches` gains no row on the
second run, and no other `game_data` row changes. See also
[re-running.md](re-running.md#tested).
