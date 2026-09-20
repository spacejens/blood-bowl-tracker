# review-race

`tools/review-race` renders a side-by-side HTML report of everything known about a
sampled set of races and their positions: each import source's **raw** view of race
availability, position availability, position characteristics, position starting
skills and position keywords next to what the importers actually stored in
`positions_race_eras`, `position_rules_sets`, `position_rules_set_skills` and
`position_rules_set_keywords`. Like
`tools/review-match` and `tools/review-player` it is a review aid for a human — it
cannot decide what is "correct" on its own, because the interpretation logic it
deliberately does not run is the thing being reviewed.

**Architectural boundary:** the raw-source panels never depend on `packages/game-data`,
`packages/parse-tp`, `packages/import`, `tools/import-bbl`, `tools/import-tp` or
`tools/import-manual` — not for parsing, not for lookups, and not for "safe" shared
domain knowledge such as BBL page selectors or TP field names. Code that looks
duplicated from those tools — the BBL page selectors, the TP official-team-list field names, the
JSON5 shapes — is duplicated on purpose: sharing it would let a bug agree with itself
instead of showing up as a difference. That rule covers the **domain-specific** half
only. The domain-agnostic scaffolding (HTML fragment assembly, timestamped report
writing, JSON5 config loading, the `DataTypeReviewer`/`Stratifier` plug-in contracts
and the app-module wiring) is shared with `tools/review-match` and `tools/review-player`
through `packages/review-harness` — it never touches a raw source's meaning, so it
cannot agree with itself about one. Locating and byte-decoding a BBL mirror file is
shared on the same basis, via `packages/read-bbl-mirror`: it carries no BBL-page-type
awareness or HTML parsing, so depending on it does not weaken the boundary above.

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

1. Samples races across eleven strata (`racesPerStratum` races, default 3, per stratum —
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
   5. **Race has a position whose starting skills changed between rules sets** — races
      where a position's stored starting-skill set (compared as a sorted id array, via
      `array_agg`) differs between two rules sets its race's eras both map to. A
      stratifier only ever sees the database, so this is the closest DB-expressible
      signal to a raw-vs-imported mismatch — it cannot itself tell a genuine rules
      change from a curation slip, only surface the pair for a human to check.
   6. **Race has a position with a starting skill that rules set does not have** — races
      where a stored `position_rules_set_skills` row names a skill with no
      `skill_rules_sets` row for the very rules set it is recorded under, which is
      always wrong. Also DB-only.
   7. **Race has a BB2025 position with no keyword recorded** — races where a BB2025
      `position_rules_sets` row (BB2025 resolved by the rules set's own name, not a
      hard-coded id) has no matching `position_rules_set_keywords` row. A stratifier only
      ever sees the database, so this is the closest DB-expressible signal that a keyword
      TP published was dropped during import. Also DB-only.
   8. **Race has a position carrying three or more keywords** — races where a
      `position_rules_sets` row has three or more `position_rules_set_keywords` rows,
      which is where a wrong keyword code is most likely and least obvious. Also DB-only.
   9. **Race has no BBL data** — races with no `race_external_ids` row for the BBL
      external system. A DB-only check — it does not look at the downloaded BBL mirror
      files.
   10. **Race has no TP data** — races with no `race_external_ids` row for the TP external
      system. Same DB-only check as above, scoped to the TP external system.
   11. **Race has no manual curation entry** — unlike strata 9 and 10, this reads the
      curated `races-and-positions.json5` file itself (there is no external-id space for
      manual curation to check in the database): every race is compared by name against
      the file's entries. The three source-coverage strata are therefore not uniform in
      what they check — a race can, for example, have a BBL external-id row in the
      database with no corresponding page in the BBL mirror, or vice versa.
   12. **BBL and TP names disagree** — races present in both sources but under different
      names, beyond BBL's own `<Race> Team(s)` suffix convention. The race-identity
      panel's own BBL/TP name-agreement sub-table (below) shows this same comparison for
      every sampled race, not only the ones this stratum selects.
   13. **Random sample** — a plain random sample of races, with no selection criteria of
      its own.

   Each stratum declares one or more `sources`, but the sampler
   (`race-sampler.service.ts`) samples every stratum exactly once, using only the first
   source it declares — never once per declared source. This is why strata 1, 2, 3, 4,
   5, 6 and 13 — whose queries do not vary by source at all — still declare
   `sources: ['bbl', 'tp', 'manual']` (strata 7 and 8 declare `sources: ['tp', 'manual']`
   for the same reason, scoped to the two sources keywords meaningfully speak to): the
   list exists to describe which sources the result meaningfully speaks to, not to
   trigger repeated sampling of the same query (which would otherwise draw a different
   random sample per source and could select up to three times the configured
   `racesPerStratum`).

2. Adds every override entry listed in `overrides`, whatever the strata picked.

3. For each sampled race, renders five panel pairs. Star players are excluded
   throughout the position-availability, position-characteristics and
   position-starting-skills panels, both raw and imported — they are shared across
   races rather than owned by one, so a per-race report is the wrong place to review
   them:
   - **race-identity** — left: BBL, TP and manual curation are all attempted together in
     one panel (unlike other review tools' raw panels, which pick a single source based
     on the sampled entity's own source), each contributing its own sub-table when that
     source has data for the race. BBL's sub-table shows its race id, race-list name,
     team-page name, team-page count and team codes — it carries no cost or position
     data. TP's sub-table shows its `teamRace` code, the official list's race name, the
     rules sets whose official list carries the code, and how many positions it lists
     (a **count**, not a position list). Manual curation's sub-table shows the
     curated name and its registered external ids. A fourth sub-table, BBL/TP name
     agreement, compares BBL's
     and TP's own names for the race — accounting for BBL's `<Race> Team(s)` suffix
     convention — and renders a highlighted `MISMATCH` row when they disagree beyond
     that convention. Right: the stored race identity, its eras, and every external id
     for that race.
   - **position-availability** — left: raw BBL and TP source data showing which positions
     are listed for this race in each source (a BBL position page that does not list the
     race is rendered as a highlighted row with an explicit label `NOT LISTED`). TP's
     rows are per rules set — the same position name under two rules sets is two rows —
     because TP publishes one official team list per rules set. Plus a
     manual curation sub-table sourced from `position-availability.json5` for the
     rulebook rosters neither BBL nor TP can evidence. Right: the stored availability
     data from `positions_race_eras` for each era this race covers.
   - **position-characteristics** — left: raw BBL and TP source data for this race's
     positions, showing move/strength/agility/passing/armour (MA/ST/AG/PA/AV) per rules
     set — TP's rows carry their own rules-set column, so a position's per-rules-set
     stat lines sit side by side — plus manual curation's own characteristics for rules
     sets neither source
     evidences the same way the database stores them. A BBL position page that cannot be
     read, or that carries no characteristics table, is rendered as a highlighted row
     naming the problem instead of being silently dropped from the table. Right: the
     stored characteristics from `position_rules_sets` for the same positions and rules
     sets. A (position, rules set) pair with no stored row is rendered as a highlighted
     row carrying an explicit textual label (`missing`), so the report stays readable
     without colour.
   - **position-starting-skills** — left: raw BBL, TP and manual curation sub-tables,
     shown together exactly like the other race-scoped panels. BBL's sub-table reads its
     one rules-set-less Skills cell per position page. TP's sub-table is per rules set
     — TP names skills by a per-rules-set `skillMasterId`, resolved to a name from the
     downloaded roster files where possible, shown as `skill master #<id>` when no
     roster file explains it. Manual curation's sub-table is sourced from
     `position-skills.json5`, for the rules sets neither source covers. None of the
     three ever carries the random or elite marker — both are advancement-only concepts
     a starting skill never has. Right: the stored `position_rules_set_skills` rows, one
     sub-table per rules set the race's eras map to. A position with a characteristics
     row but no starting skills renders `none`; a position with no `position_rules_sets`
     row at all — so no row a starting skill could hang off — is rendered as a
     highlighted row labelled `missing (no characteristics row)`, mirroring how the
     characteristics panel highlights the same absence.

     Unlike the other three panels, the raw and imported starting-skills panels are
     never diffed against each other: BBL's skills carry no rules set, TP's carry
     per-rules-set ids, and the curated file carries `Name` external ids, so lining
     them up against the stored rows would mean re-running the importers' own
     resolution logic — the very thing under review. The two panels are shown side by
     side purely for a human reviewer to compare by eye.
   - **position-keywords** — left: a TP sub-table, one row per (position, rules set) TP
     publishes, showing its numeric `race`-array keyword codes resolved against the
     curated catalogue (`Goblin (111)`), with a code the catalogue does not name rendered
     as a highlighted row (`777 — not curated`); plus a manual-curation sub-table listing
     the whole curated catalogue once, not per position, so a reviewer can see the names
     codes are read against without leaving the report. Unlike the other raw panels there
     is no BBL sub-section — BBL has no keyword concept. Right: the stored
     `position_rules_set_keywords` rows, one sub-table per rules set the race's eras map
     to, with the same `none` / highlighted `missing (no characteristics row)` rendering
     as the starting-skills panel. As with starting skills, the raw and imported panels
     are never diffed against each other — TP's codes are resolved through this tool's
     own independent catalogue reader, not the importer's, so the two panels are shown
     side by side purely for a human reviewer to compare by eye.

4. Writes the report under `tools/review-race/output/` (gitignored) with a timestamp in
   the filename, and prints where it landed.

Strata that match nothing, and override ids that are not in the database, are reported as
gaps in the report (and as console warnings) — never as failures. Each stratum is sampled
exactly once, using the first source it declares, regardless of how many sources it lists —
a stratum whose query doesn't vary by source (era availability, characteristics change,
starting-skills change, name mismatch, the random baseline) declares several sources
purely to describe which sources the result speaks to, not to trigger repeated sampling —
so a stratum that finds nothing produces exactly one gap, never one per declared source.

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

A run scans every downloaded `teams/<rulesSet>/*.json` and every BBL team page once per process,
which is the slowest part of a run by a wide margin. That cost is the price of not
reusing the importers' readers, which are code under review.

The tool only reads game data. It does connect through `packages/db`'s `DbModule`, which
applies any pending migrations on connect — against a stack deployed from the same branch
that is a no-op.
