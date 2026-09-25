# Official team list import

`packages/import-tp-live` imports TP's official team list — the races,
positions and star players TP publishes per rules set, with their
characteristics, keywords and starting skills — in two ways that share one
write path:

- **Live**, `TpLiveOfficialTeamsImportService.importOfficialTeams(...)`
  (in `ImportTpLiveModule`): fetches every rules set TP has an id for
  (`BB2020`, `DB2021`, `BB2025`, from `packages/tp-paths`'
  `TpOfficialTeamsPathsService`) through one scrape-tp session, the way TP's
  teams page requests each tab, and writes each one.
- **`tpOfficialTeams.import`**, which `tools/import-tp`'s bulk run calls once
  per downloaded rules set.

Both go through `TpOfficialTeamsImportService` (in `TpOfficialTeamsModule`),
which writes one rules set at a time.

```ts
const { rulesSets } = await tpLiveOfficialTeamsImportService.importOfficialTeams();
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
   set's TP eras.
3. **Positions and stars** — grouped by (race, name); TP position ids as TP
   external ids; a regular position's Name id is `Race: Position`, a star's
   its bare name (plus its name as a TP id), so both land on the same rows as
   the inducement-hire path and the BBL importer. An official roster's
   characteristics win over a legacy roster's for the same position.
4. **Characteristics**, then **keywords** (codes decoded through the curated
   keyword catalogue) and **starting skills** — the last two only after
   characteristics, since the server rejects them for a position with no
   characteristics row.

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
An unexpected database error is the one exception: `TpOfficialTeamsImportService`
(the shared write path) does not catch it, so it propagates out of the
`tpOfficialTeams.import` procedure the same way it does for the roster, match
and competition procedures; the live entry point catches it per rules set and
reports it as an `ImportError` instead, and `tools/import-tp`'s bulk run
likewise converts a failed procedure call into an `ImportError` rather than
letting it propagate further.

The server-side write also dedupes each kind of error — an uncurated keyword
code or an unresolvable skill id, for example — per `tpOfficialTeams.import`
call, so the same gap is reported once per rules set rather than once for the
whole import; the same underlying data is written either way.

## External system

The live import registers everything under `TP_EXTERNAL_SYSTEM_NAME`, like
the other live imports; `tpOfficialTeams.import` takes the name as input.
