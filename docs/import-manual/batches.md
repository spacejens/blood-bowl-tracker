# Batches

`tools/import-manual`'s curated data lives in numbered batches under
`tools/import-manual/data/batches/`. Each batch is applied to a database once
and then kept unchanged as a historical record; the database records which
batches it holds. A full import from scratch applies the first batch, runs
the BBL and TP importers, applies the rest in order, then runs the BBL and TP
importers again (see [Operating procedure](#operating-procedure)).

## Layout

```text
tools/import-manual/data/batches/
  001-initial-seed/
  002-initial-cleanup/
  003-reset-curated-names/
  004-advancement-costs/
  005-tp-advancement-orders/
  006-bb2016-gutter-runner-skills/
  007-tp-low-spp-player-fills/
  008-tp-feed-player-fills/
  009-tp-feed-injured-player-fills/
  010-tp-journeyman-fills/
  011-tp-feed-disambiguated-fills/
  012-trophy-skill-grants/
  013-tp-lasting-injury-fills/
  014-tp-roster-snapshot-fills/
  015-rules-set-lasting-injuries/
```

A batch directory is named `NNN-<slug>`: a three-digit number and a lowercase
hyphenated slug.

- Numbers order the batches and must be unique. A batch is applied after every
  lower-numbered one. Batch 002 references rows only the BBL and TP importers
  create, so it can only be applied after them; a batch numbered above it
  therefore also lands after them on a scratch import. If such a batch
  supplies curation a source importer needs, that importer leaves the
  affected result out on its first run: a TP keyword or skill it reports as
  missing, or, without a report, BBL's chosen-or-random source of a gained
  skill and the unspent SPP both importers store, which read batch 004's
  advancement costs. A scratch import therefore runs the BBL and TP importers
  again after `apply`. They are idempotent upserts, so the second run fills in
  what the first left out. Batch 004 cannot be sequenced before the sources
  instead, because it also references rows they and batch 002 create.
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
  rules set, the primary and secondary skill categories of every CRP, CRP+
  and BB2016 position, and the free mutation of every Gudarnas Förkämpe
  award. It applies after the source importers; see [Batch 004](#batch-004).
- **005-tp-advancement-orders** — hand-curated advancement orders of five TP
  players, read from the TP notification feed, and the entries that flag the
  gained Loner of sixteen journeymen (see
  [Player advancement orders](player-advancement-orders.md)). It references players the TP
  importer creates, so it applies after the source importers, in a plain
  `apply`; when the player's SPP figures are stored, the server refuses any
  order the reported spend does not allow. A scratch import's first TP pass
  stores none yet, so the order is written after the one-for-one match
  alone; once the second TP pass stores TP's unspent figure, the SPP
  adjustments step rechecks the order and reports a contradiction as an
  import error. An entry lists every stored paid advancement of the player,
  so if he later gains one and the TP data is downloaded again, a scratch
  apply of the batch is refused until a follow-up batch supersedes it.
- **006-bb2016-gutter-runner-skills** — adds the Weeping Dagger trait to
  the BB2016 starting skills of Skaven: Gutter Runner, which batch 002 gives
  Dodge alone; the developer's physical BB2016 rulebook lists both. The entry
  restates the position's whole skill list. It references a position and
  rules-set pair whose characteristics batch 002 curates, so it applies after
  the source importers, in a plain `apply`.
- **007-tp-low-spp-player-fills** — fills in the data of 257 incomplete TP
  players whose total SPP is below the cheapest advancement of their era, so
  they provably have none: each gets his position's characteristics and
  starting skills, his whole SPP unspent, and a status of dead (a death in
  his match events) or retired. It is generated from the production database
  by `production-ops-cli generate-incomplete-player-fills` (see
  [Generated fills](filling-missing-players.md#generated-fills) for who is
  skipped and why), so it references players the TP importer creates and
  applies after the source importers, in a plain `apply`.
- **008-tp-feed-player-fills** — fills in the data of 156 incomplete TP
  players whose data could be proven: 118 whose advancements the TP feed
  reports prove, in order and to the SPP they spent, and 38 too low on SPP
  to have advanced whose stat reductions all fall in their last competition.
  It is generated from the production database and the saved TP feed history
  by `production-ops-cli generate-incomplete-player-fills --feed-channel=<id>`
  (see [Generated fills](filling-missing-players.md#generated-fills) for who
  is skipped and why). It references players the TP importer creates and
  batch 004's advancement costs, so it applies after the source importers
  and after batch 007, in a plain `apply`.
- **009-tp-feed-injured-player-fills** — fills in the data of 8 incomplete TP
  players whose advancements the TP feed reports prove and who also have
  stat reductions that certainly still apply, combined in the order they
  happened. It also lists 54 complete TP players with a stat reduction
  recorded in a match and none stored, among them players batches 007 and
  008 filled, for the server to record the lasting reductions their stored
  data shows (see
  [Recording lasting reductions](filling-missing-players.md#recording-lasting-reductions)).
  It is generated the same way as batch 008, and applies after the source
  importers and after batch 008, in a plain `apply`.
- **010-tp-journeyman-fills** — fills in the data of 40 incomplete TP
  journeymen whose stored marker is set, in a basic position and below the
  cheapest advancement of their era, so they provably have none: each gets
  his position's characteristics and starting skills (his Loner kept by the
  server), his whole SPP unspent and his status, with `journeyman: true`.
  It is generated the same way as batch 008, and applies after the source
  importers and after batch 009, in a plain `apply`.
- **011-tp-feed-disambiguated-fills** — fills in the data of 22 incomplete
  TP players whose TP feed reports match more than one stored player: 13
  whose advancements the feed reports prove, since a report can belong only
  to a TP player who can afford it and exactly one way of sharing the
  reports out between players with the same name and position passes the
  pricing checks, and 9 marked journeymen no report can belong
  to, filled as having none. It is generated the same way as batch 008, and
  applies after the source importers and after batch 010, in a plain
  `apply`.
- **012-trophy-skill-grants** — restates Gudarnas Förkämpe, the one curated
  trophy whose award gives its player a skill (a free mutation), with
  `grantsSkill: true` (see [Trophies section](trophies.md)), so the fill
  generator treats only its awards as a possible free skill. It also fills
  in the data of 5 incomplete TP players that change made provable: each
  holds only awards of trophies that grant no skill (Trogen Tjänst, Top
  Intercepter). The fills are generated the same way as batch 008, but from
  a restored production backup with this batch's trophy entry applied,
  because the generator needs the flag this batch sets, which production
  gets only when the batch is applied. The trophy entry runs before the fills within the batch. It
  applies after the source importers and after batch 011, in a plain
  `apply`.
- **013-tp-lasting-injury-fills** — fills in the data of 2 incomplete TP
  players too low on SPP to have advanced whose stat reductions certainly
  still apply, because they died before any point where lasting injuries
  could heal had passed (see
  [Generated fills](filling-missing-players.md#generated-fills)). It is
  generated the same way as batch 008, and applies after the source
  importers and after batch 012, in a plain `apply`.
- **014-tp-roster-snapshot-fills** — fills in the data of 97 incomplete TP
  players at or above the cheapest advancement whom the TP feed never
  reported, all from downloaded TP match and roster snapshots that prove
  their gained skills (43 gained none), with exactly one order and
  chosen-or-random source fitting the SPP they spent (see
  [Generated fills](filling-missing-players.md#generated-fills) and
  [Roster snapshot evidence](roster-snapshot-evidence.md)). It is
  generated the same way as batch 008, with `--snapshots` after
  `read-tp-roster-snapshots`, and applies after the source importers and
  after batch 013, in a plain `apply`.
- **015-rules-set-lasting-injuries** — restates each of the six rules sets
  batch 001 curates, with only `name`, `externalIds` and
  `lastingInjuriesNeverHeal` (see [Rules sets](index.md#rules-sets)):
  `true` for CRP, CRP+ and BB2016, under which niggling injuries and
  characteristic reductions never heal, and `false` for BB2020, DB2021 and
  BB2025. The fill generator reads the flag to prove lasting injuries (see
  [Generated fills](filling-missing-players.md#generated-fills)). Until this
  batch is applied every rules set reads `false`, so the generator proves
  fewer fills, never a wrong one. It applies after the source importers and
  after batch 014, in a plain `apply`.

A batch can also fill in the data of a TP player the TP import left
incomplete, through the `incompletePlayerFills` section; see
[Filling in missing players](filling-missing-players.md).

### Batch 004

Detail for the 004-advancement-costs entry above.

- **Advancement costs:** fixed thresholds for CRP, CRP+ and BB2016, and a
  cost per advancement kind for BB2020, DB2021 and BB2025, plus tLoEG's
  house-rule Fan Favourite advancement under CRP, CRP+ and BB2016 (see
  [Star Player Points sections](star-player-points.md#advancement-costs)).
- **Skill categories:** the primary and secondary skill categories of every
  CRP, CRP+ and BB2016 position. Gap-fill entries for BB2020, DB2021 and
  BB2025 positions TP's official team list does not supply are allowed, but
  there are currently none.
- **Sources:** CRP+ primary comes from NTBB2015's Talent column and secondary
  from the CRP entry. BB2016 comes from the Teams of Legend PDF and the
  developer's physical BB2016 rulebook (see
  [curated files: Batch 004](curated-files.md#batch-004)).
- **Trophy awards:** the free mutation of every Gudarnas Förkämpe award
  (`trophy-awards.json5`).
- **Apply ordering:** the advancement costs reference only the rules sets,
  the tLoEG league and the Fan Favourite skill that batch 001 declares, but
  the skill categories reference positions and characteristics that the
  source importers and batch 002 create, and the trophy awards reference
  competitions and players the BBL and TP importers create, so the batch
  applies after them, in a plain `apply`.
- **Scratch re-run:** on a scratch import the BBL and TP importers then run
  again, so the skill sources and unspent SPP that read these costs are
  filled in.

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
   batch, run the BBL and TP importers, apply the rest, then run the BBL and
   TP importers again."

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
  importer, a plain `apply`, which applies 002, 003, 004 and anything newer,
  then the BBL importer and the TP importer again. The second BBL and TP run
  is part of the normal sequence: BBL's chosen-or-random skill sources and
  the unspent SPP both importers store read batch 004's advancement costs,
  which exist only once the plain `apply` has run. The `deploy-local` and
  `deploy-production` skills run this whole sequence as their full import.
  A plain `apply` on a fresh database before the source importers fails at
  002, which references rows only the sources create, and leaves it
  unrecorded; it is safe to rerun after the sources.
- **Long-lived database (production):** a plain `apply`. It
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
