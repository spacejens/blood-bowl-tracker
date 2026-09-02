# review-race

`tools/review-race` renders a side-by-side HTML report of everything known about a
sampled set of races and their positions: each import source's **raw** view of race
availability, position availability, and position characteristics next to what the
importers actually stored in `positions_race_eras` and `position_rules_sets`. Like
`tools/review-match` and `tools/review-player` it is a review aid for a human — it
cannot decide what is "correct" on its own, because the interpretation logic it
deliberately does not run is the thing being reviewed.

**Architectural boundary:** the raw-source panels never depend on `packages/game-data`,
`packages/parse-tp`, `packages/import`, `tools/import-bbl`, `tools/import-tp` or
`tools/import-manual` — not for parsing, not for lookups, and not for "safe" shared
domain knowledge such as BBL page selectors or TP field names. Code that looks
duplicated from those tools — the BBL page selectors, the TP roster field names, the
JSON5 shapes — is duplicated on purpose: sharing it would let a bug agree with itself
instead of showing up as a difference. That rule covers the **domain-specific** half
only. The domain-agnostic scaffolding (HTML fragment assembly, timestamped report
writing, JSON5 config loading, the `DataTypeReviewer`/`Stratifier` plug-in contracts
and the app-module wiring) is shared with `tools/review-match` and `tools/review-player`
through `packages/review-harness` — it never touches a raw source's meaning, so it
cannot agree with itself about one.

The manual curation data under `tools/import-manual/data/before-other-importers/` and
`after-other-importers/` is treated here as a **raw source**, not as part of the
imported database. This is why the tool is the first review tool to treat it as an
independent source: races and position characteristics that are hand-curated — precisely
the older rules sets' characteristics and the availability data neither BBL nor TP can
evidence — need to be checked against imported data as an independent source of truth,
which is what this tool does.

Races are the sampled unit, and each race's entry nests its positions, matching how a
human checks a rulebook. The report document is shared with `tools/review-match` and
`tools/review-player` through `packages/review-harness`: `report-builder.service.ts` and
`review.service.ts` are thin subclasses of the harness's `ReportBuilderBase`/`ReviewServiceBase`,
adding only the per-race section. `harness.module.ts` stays local because it _is_ this
tool's own composition.

## What it does

1. Samples races across nine strata (`racesPerStratum` races, default 3, per stratum —
   see Configuration; a race is the sampled unit; "modern rules set" means
   `passing_format` is not `'absent'`):
   1. **Race no longer available under modern rules sets** — races whose eras map to no
      rules set with a modern `passing_format`. A pure DB query over
      `races ⋈ race_eras ⋈ era_rules_sets ⋈ rules_sets`; it never reads manual curation
      or a raw source file.
   2. **Race only available under modern rules sets** — the mirror image: races whose
      eras map to no rules set with a legacy (non-modern) `passing_format`. Same pure
      DB query as above, with the condition flipped.
   3. **Race has a position whose characteristics changed between rules sets** — races
      where a position's move, strength, agility, armour or passing differs between two
      rules sets its race's eras both map to.
   4. **Race has a position missing characteristics for a rules set it should have** —
      races where `position_rules_sets` lacks a row for a (position, rules set) pair its
      era mapping implies, suggesting incomplete data entry.
   5. **Race has no BBL data** — races with no `race_external_ids` row for the BBL
      external system. A DB-only check — it does not look at the downloaded BBL mirror
      files.
   6. **Race has no TP data** — races with no `race_external_ids` row for the TP external
      system. Same DB-only check as above, scoped to the TP external system.
   7. **Race has no manual curation entry** — unlike strata 5 and 6, this reads the
      curated `races-and-positions.json5` file itself (there is no external-id space for
      manual curation to check in the database): every race is compared by name against
      the file's entries. The three source-coverage strata are therefore not uniform in
      what they check — a race can, for example, have a BBL external-id row in the
      database with no corresponding page in the BBL mirror, or vice versa.
   8. **BBL and TP names disagree** — races present in both sources but under different
      names, beyond BBL's own `<Race> Team(s)` suffix convention. The race-identity
      panel's own BBL/TP name-agreement sub-table (below) shows this same comparison for
      every sampled race, not only the ones this stratum selects.
   9. **Random sample** — a plain random sample of races, with no selection criteria of
      its own.

   Each stratum declares one or more `sources`; the sampler (`race-sampler.service.ts`)
   runs the stratum's query once per declared source and merges the results by
   `raceId`, folding any duplicate reason text into one entry rather than reporting one
   per source. This is why strata 1, 2, 3, 4 and 9 — whose queries do not vary by
   source at all — still declare `sources: ['bbl', 'tp', 'manual']`: it keeps the
   stratum list uniform without producing three identical findings for one race.

2. Adds every race id listed in `overrides`, whatever the strata picked.

3. For each sampled race, renders three panel pairs:
   - **race-identity** — left: BBL, TP and manual curation are all attempted together in
     one panel (unlike other review tools' raw panels, which pick a single source based
     on the sampled entity's own source), each contributing its own sub-table when that
     source has data for the race. BBL's sub-table shows its race id, race-list name,
     team-page name, team-page count and team codes — it carries no cost or position
     data. TP's sub-table shows its `teamRace` code, `rosterMaster.name`, roster count
     and position **count** (not a position list). Manual curation's sub-table shows the
     curated name and its registered external ids. A fourth sub-table, BBL/TP name
     agreement, compares BBL's
     and TP's own names for the race — accounting for BBL's `<Race> Team(s)` suffix
     convention — and renders a highlighted `MISMATCH` row when they disagree beyond
     that convention. Right: the stored race identity, its eras, and every external id
     for that race.
   - **position-availability** — left: raw BBL and TP source data showing which positions
     are listed for this race in each source (a BBL position page that does not list the
     race is rendered as a highlighted row with an explicit label `NOT LISTED`). Right:
     the stored availability data from `positions_race_eras` for each era this race covers.
   - **position-characteristics** — left: raw BBL and TP source data for this race's
     positions, showing move/strength/agility/passing/armour (MA/ST/AG/PA/AV) per rules
     set, plus manual curation's own characteristics for rules sets neither source
     evidences the same way the database stores them. A BBL position page that cannot be
     read, or that carries no characteristics table, is rendered as a highlighted row
     naming the problem instead of being silently dropped from the table. Right: the
     stored characteristics from `position_rules_sets` for the same positions and rules
     sets. A (position, rules set) pair with no stored row is rendered as a highlighted
     row carrying an explicit textual label (`missing`), so the report stays readable
     without colour.

4. Writes the report under `tools/review-race/output/` (gitignored) with a timestamp in
   the filename, and prints where it landed.

Strata that match nothing, and override ids that are not in the database, are reported as
gaps in the report (and as console warnings) — never as failures. A stratum with several
declared sources that finds nothing for any of them still reports one gap, not one per
source: the sampler dedupes gaps by their reason text before returning them.

## Configuration

```bash
cp tools/review-race/review-race-config.example.json5 tools/review-race/review-race-config.json5
```

| Key | Meaning |
| --- | --- |
| `database.url` | Connection string of the database holding the imported data (required) |
| `racesPerStratum` | Races sampled per stratum (default 3) |
| `bbl.dataDir` / `tp.dataDir` | The same downloaded data directories `tools/import-bbl` / `tools/import-tp` read |
| `manual.dataDir` | `tools/import-manual`'s committed `data/` directory, holding `before-other-importers/` and `after-other-importers/` |
| `bbl.externalSystemName` / `tp.externalSystemName` | External-system names the imports registered records under (default `BBL` / `TP`; this project's own imports register `tloeg.bbleague.se` / `tourplay.net`) |
| `overrides.bbl` / `overrides.tp` / `overrides.manual` | Races always included — BBL's numeric race id, TP's `teamRace` code, or (for manual) the race's own name |
| `outputPath` | Base path each report is written next to, timestamped (default `output/report.html`) |

Relative paths resolve against the working directory, which is `tools/review-race/` when
the tool is run as documented below.

## Running it

The stack must be running and already imported into.

```bash
pnpm --filter @blood-bowl-tracker/review-race run build
pnpm --filter @blood-bowl-tracker/review-race run start
```

Exit codes: `0` with `Reviewed <N> race(s); report written to <path>.` on success; `1`
with `Review failed: <error>` when the database is unreachable or the config is unusable.

A run scans every downloaded `rosters_*.json` and every BBL team page once per process,
which is the slowest part of a run by a wide margin. That cost is the price of not
reusing the importers' readers, which are code under review.

The tool only reads game data. It does connect through `packages/db`'s `DbModule`, which
applies any pending migrations on connect — against a stack deployed from the same branch
that is a no-op.
