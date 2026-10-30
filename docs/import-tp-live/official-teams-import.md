# Official team list import

`packages/import-tp-live` imports TP's official team list — the races,
positions and star players TP publishes per rules set, with their
characteristics, keywords, starting skills and skill categories — in two
ways that share one write path:

- **Live**, `TpLiveOfficialTeamsImportService.importOfficialTeams(...)`
  (in `ImportTpLiveModule`): fetches every rules set TP has an id for
  (`BB2020`, `DB2021`, `BB2025`, from `packages/tp-paths`'
  `TpOfficialTeamsPathsService`) through one scrape-tp session, the way TP's
  teams page requests each tab, and writes each one.
- **`tpOfficialTeams.import`**, which `tools/import-tp`'s bulk run calls
  several times per downloaded rules set, with chunks of whole races (see
  [tools/import-tp's official team list requests](../import-tp/official-teams-requests.md)).
  Every stage works only on the races it is given, so a chunk is imported
  exactly like a small rules set. The live import, which runs in-process with
  no HTTP timeout, still writes each rules set in one call.

Both go through `TpOfficialTeamsImportService` (in `TpOfficialTeamsModule`),
which writes one rules set at a time.

```ts
const { rulesSets } =
  await tpLiveOfficialTeamsImportService.importOfficialTeams({
    externalSystemName: TP_EXTERNAL_SYSTEM_NAME,
  });
for (const { rulesSet, fetch, write } of rulesSets) {
  // fetch: races fetched + fetch/parse failures; write: one ImportResult per stage
}
```

## What one rules set's import does

1. **Context** — upserts the TP and Name external systems, resolves the rules
   set by its TP external id (its name) and lists the eras that declare it
   _and_ were imported from TP. A rules set not imported yet imports nothing;
   one no TP era declares is still imported, without race/era availability.
2. **Races** — grouped by display name, every variant `teamRaceCode` as a TP
   external id plus the name as a Name external id, available in the rules
   set's TP eras. A race's and a position's name is set only when this import
   creates it.
3. **Positions and stars** — grouped by (race, name); TP position ids as TP
   external ids; a regular position's Name id is `Race: Position`, a star's
   its bare name (plus its name as a TP id), so both land on the same rows as
   the inducement-hire path and the BBL importer. An official roster's
   characteristics win over a legacy roster's for the same position.
4. **Characteristics**, then **keywords** (codes decoded through the curated
   keyword catalogue), **starting skills** and **skill categories**. The last
   three run only after characteristics, since the server rejects them for a
   position with no characteristics row. Skill categories are written as each
   position's complete primary/secondary set (decoded from TP's
   `skillNormal`/`skillDouble`), so a category TP stops listing is flagged
   removed. A position whose categories are corrupt in TP's data is reported
   and skipped, leaving its existing categories untouched.

## Batched writes

Races and positions are upserted one at a time, but each of the four
stages in step 4 writes the whole rules set in a single sync call carrying
every position's entries, instead of one call per position. The server
validates a sync all-or-nothing, so when a stage's batch is rejected (for
example a keyword for a position whose characteristics failed to write)
that stage retries one position at a time. A characteristics or keywords
failure names the position; a starting-skills failure identifies it by
position id; a skill-categories failure names the position. Every other
position is still written. A stage with nothing to write makes no call.

## Starting skills

TP names a skill only by its `skillMasterId`. When the caller supplies names
(`skillMasters` — `tools/import-tp` scans them from its downloaded rosters and
matches) a named skill is upserted by name and registers every TP id given
for that name. Any other id resolves only through a skill that already
carries it as a TP external id — registered by an earlier roster, match or
bulk import, or curated in `tools/import-manual`. The live import supplies no
names, so it relies on that. An id neither way explains is reported once and
left out; the position's other skills are still written. Hatred and
Animosity targets (TP's type-3 attribute codes) are decoded through the
curated keyword catalogue.

## Failures

Nothing here throws for bad data: every fetch, parse or write failure is one
`ImportError` in the relevant result, and the rest of the import continues —
another rules set, race, position or skill is never blocked by one failure.
A TP block is different: `TpBlockedError` stops the live import at once, so no
further rules set is fetched (see
[Failures in the index](index.md#failures)).
An unexpected database error is another exception: `TpOfficialTeamsImportService`
(the shared write path) does not catch it, so it propagates out of the
`tpOfficialTeams.import` procedure the same way it does for the roster, match
and competition procedures; the live entry point catches it per rules set and
reports it as an `ImportError` instead, and `tools/import-tp`'s bulk run
likewise converts a failed procedure call into an `ImportError` rather than
letting it propagate further.

The server-side write also dedupes each kind of error (an uncurated keyword
code or an unresolvable skill id, for example) per `tpOfficialTeams.import`
call, so the same gap is reported once per call rather than once per
position. `tools/import-tp` sends a rules set in several calls and
de-duplicates those repeats again when it merges them, so its run still
reports each gap once per rules set. The same underlying data is written
either way.

## Stage timings

`TpOfficialTeamsImportService` times each stage it runs, with a monotonic
clock, and returns the durations in the result's optional `timings`, in
order: `context`, `races`, `positions`, `characteristics`, `keywordCatalog`,
`keywords`, `skillRefs`, `startingSkills`, `skillCategories`, each as
`{ stage, ms }`. A stage that reports errors is still timed. When the rules
set's context cannot be resolved, only `context` is listed. `tools/import-tp`
prints them per request at the end of every run. The live import ignores
them.

## External system

Like the other live imports, the live import registers everything under the
`externalSystemName` its caller passes, with no default;
`tpOfficialTeams.import` takes the name as input too. Every caller in this
repository passes `TP_EXTERNAL_SYSTEM_NAME`.
