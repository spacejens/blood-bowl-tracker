# Batches

`tools/import-manual`'s curated data lives in numbered batches under
`tools/import-manual/data/batches/`. Each batch is applied to a database once
and then kept unchanged as a historical record; the database records which
batches it holds. A full import from scratch applies the first batch, then the BBL and TP importers, then the rest, in
order.

## Layout

```text
tools/import-manual/data/batches/
  001-initial-seed/
  002-initial-cleanup/
  003-reset-curated-names/
  004-advancement-costs/
```

A batch directory is named `NNN-<slug>`: a three-digit number and a lowercase
hyphenated slug.

- Numbers order the batches and must be unique. A batch is applied after every
  lower-numbered one. Batch 002 references rows only the BBL and TP importers
  create, so it can only be applied after them; a batch numbered above it
  therefore also lands after them on a scratch import. If such a batch
  supplies curation a source importer needs (a TP keyword or skill, say), that
  importer reports the missing curation and leaves the affected record out, so
  rerun it after `apply`. The source importers are idempotent upserts, so the
  rerun repairs the omission. To avoid the rerun, a curator can sequence the
  scratch import so the prerequisite batch is applied before the sources:
  `apply <batch>` applies exactly one batch, provided every lower-numbered
  batch is recorded or applied first.
- Within a batch, every `.json5` file directly in the directory is read in
  alphabetical order and pooled exactly as described in
  [Data files](index.md#data-files).

The batches:

- **001-initial-seed** and **002-initial-cleanup** — the curated data as it
  stood when batches were introduced: 001 holds the records the BBL and TP
  importers should find already registered and match against, 002 the cleanup
  that needs the rows those importers create. What each file is for is
  described in [Curated data files](curated-files.md).
- **003-reset-curated-names** — restates, with only `name` and
  `externalIds`, the curated name of every coach, team, race, position,
  competition and skill batches 001 and 002 curate. A long-lived database can
  carry a source's spelling for a row whose curated name came later (TP's
  "Gyttjevrålarna FC" for the team curated as "Gyttjevrålarna", BBL's
  "Bretonnians" for the race curated as "Bretonnian"); this batch puts each
  row on the name a fresh import ends with. On a fresh import it changes
  nothing. `curated-data-batch-003.spec.ts` keeps it in step with batches 001
  and 002.
- **004-advancement-costs** — the SPP cost of each advancement for every
  rules set: fixed thresholds for CRP, CRP+ and BB2016, and a cost per
  advancement kind for BB2020, DB2021 and BB2025, plus tLoEG's house-rule Fan
  Favourite advancement under CRP, CRP+ and BB2016 (see
  [Star Player Points sections](star-player-points.md#advancement-costs)). It
  references the rules sets, the tLoEG league and the Fan Favourite skill that
  batch 001 declares, so its cost rows need nothing from the source importers.
  It also names the free mutation of every Gudarnas Förkämpe award
  (`trophy-awards.json5`). Those entries reference competitions and players
  the BBL and TP importers create, so the batch lands after them like every
  batch above 002. The api-server must already run a release whose
  `advancementCosts.sync` accepts league and skill ids and whose
  `trophyAwards.upsert` accepts `grantedSkillId` before the batch is applied.

## Changing curated data

Never edit an applied batch — not even to fix a typo. Put the change in a new
batch with the next free number, restating only what
changes; an entry overlays the existing row (see
[Data files](index.md#data-files)). An entry that restates a race, star player
or keyword should carry exactly the external ids the earlier entry has: the
review tools match a later batch's entry to an earlier one by their full set
of external ids. The importer refuses to run when an
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
node dist/main.js apply                          # apply every unrecorded batch, in number order
node dist/main.js apply <batch-name>             # apply exactly that one batch
node dist/main.js mark-applied <batch>...        # record batches without importing
node dist/main.js <directory>                    # ad hoc import, records nothing
```

`apply` reads the tool's own `data/batches/` whatever the working directory.
`<batch-name>` is the exact directory name (`apply 001-initial-seed`). Each
run:

1. checks every recorded batch still exists with the content it was recorded
   with, and fails otherwise;
2. for `apply <batch-name>`, skips the batch if it is already recorded;
   otherwise fails while any lower-numbered batch is unrecorded, naming them:
   apply them first, or `mark-applied` them if the database already holds
   their data;
3. imports each unrecorded batch (all of them, or the one named) in number
   order, printing `Skipped batch <name> (already applied).` or
   `Applied batch <name>.`;
4. records a batch only when it imported with zero errors. The first batch
   with errors is left unrecorded and no later batch is attempted, since later
   batches may depend on it; fix the cause and run the command again — every
   write is an idempotent upsert, so re-importing the batch is safe. On such a
   failure stderr also prints the hint "On a fresh database apply the first
   batch, run the BBL and TP importers, then apply the rest."

On success the last line is `Imported <N> record(s) successfully.`; collected
errors are printed one per line under `Import completed with <N> errors:`,
followed by which batch was left unrecorded, and the tool exits non-zero. An
unexpected failure (unreachable API, malformed file, a changed applied batch,
an invalid batch name, duplicate batch numbers, `apply` of an unknown batch or
past an unrecorded lower one, `mark-applied` with no names or an unknown name)
is printed as `Import failed:`.

`mark-applied` records the named batches with their current content hashes
without importing anything, for a database that already holds their data. A
batch already recorded with the same content is reported and left alone. It
does not check batch order: mark every lower-numbered batch the database holds,
because a later plain `apply` imports any batch still unrecorded.

Passing a directory instead imports that directory ad hoc and records nothing
— useful for trying out data before it becomes a batch.

## Operating procedure

- **Scratch database:** `apply 001-initial-seed`, the BBL importer, the TP
  importer, then a plain `apply`, which applies 002, 003, 004 and anything newer.
  A plain `apply` on a fresh database before the source importers fails at
  002, which references rows only the sources create, and leaves it
  unrecorded; it is safe to rerun after the sources.
- **Once, on a database that already holds the initial batches** (production,
  imported before batches existed), before its first `apply`: a plain `apply`
  on a database with an empty ledger re-imports every batch, including 001 and
  002, so record them first with `mark-applied 001-initial-seed
  002-initial-cleanup`, then `apply` to apply batch 003. Only do
  this if the database's last manual import ran from the current content of
  both batches; `mark-applied` records them as applied without importing, so
  anything merged since would never reach the database. Otherwise first import
  the two directories ad hoc (`node dist/main.js data/batches/001-initial-seed`,
  then `data/batches/002-initial-cleanup`; both are idempotent upserts)
  and mark them applied afterwards. The api-server must already run a release
  with the `manualImportBatches` procedures (see
  [production imports](../discord-bot/production-imports.md)).
- **Long-lived database (production), afterwards:** a plain `apply`. It
  applies just the batches not yet recorded.

## Tested

`test/importer-double-run.e2e-spec.ts` runs `apply 001-initial-seed`, a BBL/TP
stand-in and a plain `apply`, twice against a real Postgres. Without the real
source importers batch 002 always fails on its references to rows only they
create, so the plain `apply` stops there and leaves it unrecorded; the batches
numbered above it are then run by directory so their content still takes part.
The suite asserts the second `apply 001-initial-seed` applies nothing,
`manual_import_batches` gains no row on the second run, and no other
`game_data` row changes. See also [re-running.md](re-running.md#tested).
