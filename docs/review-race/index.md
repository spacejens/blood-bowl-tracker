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

1. Samples races across nine strata (a race is the sampled unit; "modern rules set" means
   `passing_format` is not `'absent'`):
   1. **Race no longer available under modern rules sets** — races present in manual
      curation or a raw data source but absent from modern rules sets.
   2. **Race only available under modern rules sets** — races in modern rules sets but
      absent from older ones (manual curation or raw sources).
   3. **Race has a position whose characteristics changed between rules sets** — races
      where a position has differing characteristics across rules sets (columns, cost,
      skills, etc.).
   4. **Race has a position missing characteristics for a rules set it should have** —
      races where `position_rules_sets` lacks a row for a rules set its era maps to,
      suggesting incomplete data entry.
   5. **Race has no BBL data** — races in manual curation or TP but not in downloaded BBL
      files.
   6. **Race has no TP data** — races in manual curation or BBL but not in downloaded TP
      files.
   7. **Race has no manual curation entry** — races in BBL or TP but absent from the
      hand-curated data.
   8. **BBL and TP names disagree** — races present in both sources but under different
      names.
   9. **Random sample** — `racesPerStratum` races (default 3) per stratum, selected
      randomly from those matching the stratum's criteria.

   When a stratum's criteria are satisfied by multiple sources (e.g., a race's BBL name
   and TP name both disagree), the sampler collapses those into one entry with one reason
   — which is why `sources` on such a stratum is a formality rather than three separate
   entries.

2. Adds every race id listed in `overrides`, whatever the strata picked.

3. For each sampled race, renders three panel pairs:
   - **race-info** — left: BBL's own race page parsed for name, cost (if any), and
     available positions; TP's roster data parsed for name and position list; or manual
     curation showing name and position list. Right: the stored race identity and every
     external id for that race. A race with no `position_rules_sets` row for a rules set
     its era maps to is rendered as a highlighted row carrying an explicit textual label
     (`missing`), so the report stays readable without colour.
   - **position-availability** — left: raw BBL and TP source data showing which positions
     are listed for this race in each source (a BBL position page that does not list the
     race is rendered as a highlighted row with an explicit label `NOT LISTED`). Right:
     the stored availability data from `positions_race_eras` for each era this race covers.
   - **position-characteristics** — left: raw BBL and TP source data for a sample of this
     race's positions, showing characteristics (cost, columns, skills) per rules set.
     Right: the stored characteristics from `position_rules_sets` for the same positions
     and rules sets. Missing characteristics are highlighted with an explicit label
     (`missing`).

4. Writes the report under `tools/review-race/output/` (gitignored) with a timestamp in
   the filename, and prints where it landed.

Strata that match nothing, and override ids that are not in the database, are reported as
gaps in the report (and as console warnings) — never as failures.

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
