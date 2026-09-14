# review-star-player

`tools/review-star-player` renders a side-by-side HTML report of everything known
about a sampled set of star players: each import source's **raw** view of a star's
identity, its per-rules-set characteristics, and its hire eligibility, next to what
the importers and hand curation actually stored in `positions`, `position_rules_sets`
and `positions_race_eras`. Like `tools/review-match`, `tools/review-player` and
`tools/review-race` it is a review aid for a human — it cannot decide what is
"correct" on its own, because the interpretation logic it deliberately does not run
is the thing being reviewed.

## Why star players get their own tool

`tools/review-race` deliberately excludes star players from its per-race panels: a
star is not owned by one race, and repeating it across every race that can hire it
would add little review benefit (issue #852, closed as not-a-bug). That left star
data reviewed by nothing. Hire eligibility is the part most worth scrutinising,
because `tools/import-bbl`'s star-player exception links a star as available in
essentially every era its races span, rather than deriving eligibility from the
source.

**Architectural boundary:** the raw-source panels never depend on
`packages/game-data`, `packages/parse-tp`, `packages/import`, `tools/import-bbl`,
`tools/import-tp`, `tools/import-manual`, **or on `tools/review-race`** — not for
parsing, not for lookups, and not for "safe" shared domain knowledge such as BBL
page selectors or TP field names. Code that looks duplicated from those tools — the
BBL page selectors, the TP `teamRace`/mask field names, the JSON5 shapes — is
duplicated on purpose: sharing it would let a bug agree with itself instead of
showing up as a difference. That rule covers the **domain-specific** half only. The
domain-agnostic scaffolding (HTML fragment assembly, timestamped report writing,
JSON5 config loading, the `DataTypeReviewer`/`Stratifier` plug-in contracts and the
app-module wiring) is shared with the other three review tools through
`packages/review-harness` — it never touches a raw source's meaning, so it cannot
agree with itself about one. Locating and byte-decoding a BBL mirror file is shared
on the same basis, via `packages/read-bbl-mirror`: it carries no BBL-page-type
awareness or HTML parsing, so depending on it does not weaken the boundary above.

## What it does

1. Samples star players across nine strata (`starsPerStratum` stars, default 3, per
   stratum — see Configuration; a star player is the sampled unit):
   1. **Star player has no BBL data** — stars with no `position_external_ids` row
      for the BBL external system. A DB-only check — it does not look at the
      downloaded BBL mirror files.
   2. **Star player has no TP data** — stars with no `position_external_ids` row
      for the TP external system. Same DB-only check as above, scoped to the TP
      external system.
   3. **Star player has no manual curation entry** — reads the curated
      `star-players.json5` file itself (there is no external-id space for manual
      curation to check in the database): every star is compared by name or
      external id against the file's entries.
   4. **Star player's characteristics changed between rules sets** — stars whose
      move, strength, agility, passing or armour differs between two rules sets
      they have `position_rules_sets` rows for. A pure DB self-join.
   5. **Star player is missing characteristics for a rules set it is hireable
      under** — stars whose stored eligibility implies a rules set they have no
      `position_rules_sets` row for. This is the exact shape
      `tools/import-bbl`'s star-player exception produces, so it is the stratum
      most likely to earn its place in a run.
   6. **Star player has characteristics for some, but not all, rules sets it is
      hireable under** — narrower than stratum 5: only stars with partial,
      inconsistent coverage (at least one rules set with a row and at least one
      without), which is a genuine inconsistency rather than a blanket gap.
   7. **Star player hireable by more than one race** — the mercenary case, and the
      one `tools/import-bbl`'s star-player exception can inflate.
   8. **Star player hireable by exactly one race** — the rarer, effectively
      roster-embedded case, where a wrongly narrow eligibility row hides.
   9. **Random sample** — a plain random sample of star players, with no selection
      criteria of its own.

   Each stratum declares one or more `sources`, but the sampler
   (`star-player-sampler.service.ts`) samples every stratum exactly once, using
   only the first source it declares — never once per declared source. A stratum
   that finds nothing produces exactly one gap, reported as a warning, never a
   failure.

2. Adds every override entry listed in `overrides`, whatever the strata picked.

3. For each sampled star player, renders three panel pairs:
   - **star-player-identity** — left: BBL's page (typID, page name, inducement
     price, the "Can play for" line, skills), TP's per-rules-set catalog entries
     (name, rules set, cost, special rule, eligible-roster count), the curated
     `star-players.json5` entry, and a BBL/TP name-agreement verdict that treats
     apostrophe style, quote style, case and a duo star's parenthesised partner as
     expected differences (anything else renders as a highlighted `MISMATCH` row).
     Right: the stored `positions` row, `is_star_player`, an explicit
     **"Cost — not stored"** row (the table has no cost column), and every
     external id.
   - **star-player-characteristics** — left: BBL's single undated page stat line,
     TP's per-rules-set values, and the curated `position_rules_sets` entries
     (from both `position-characteristics.json5` and
     `position-characteristics-gap-fill.json5`, which reference a star by its
     bare name). Right: the stored rows, one per rules set the star's eligibility
     implies, each in that rules set's own display format, with a highlighted
     `missing` row for a rules set with no stored row and a highlighted trailing
     row for a stored row no era implies.
   - **star-player-hire-eligibility** — left: BBL's `Can play for:` line verbatim
     (BBL states eligibility as a team special rule, not a race list), the
     `teamRace` codes TP's `availableLeagues`/`availableTeamSpecialRules` masks
     make the star hireable by (including `selectable*` halves, official and
     legacy rosters only), the curated `raceEras` pairs, and a race-count verdict
     that highlights `WIDER IN DB` when the database claims strictly more races
     than TP's masks support. Right: one row per stored `(race, era)` pair, headed
     by the distinct-race count.

4. Writes the report under `tools/review-star-player/output/` (gitignored) with a
   timestamp in the filename, and prints where it landed.

Strata that match nothing, and override ids that are not in the database, are
reported as gaps in the report (and as console warnings) — never as failures. Each
stratum is sampled exactly once, using the first source it declares, regardless of
how many sources it lists.

## Configuration

```bash
cp tools/review-star-player/review-star-player-config.example.json5 tools/review-star-player/review-star-player-config.json5
```

| Key | Meaning |
| --- | --- |
| `database.url` | Connection string of the database holding the imported data (required) |
| `starsPerStratum` | Star players sampled per stratum (default 3) |
| `bbl.dataDir` / `tp.dataDir` | The same downloaded data directories `tools/import-bbl` / `tools/import-tp` read |
| `manual.dataDir` | `tools/import-manual`'s committed `data/` directory, holding `before-other-importers/` and `after-other-importers/` |
| `bbl.externalSystemName` / `tp.externalSystemName` | External-system names the imports registered records under (default `BBL` / `TP`; this project's own imports register `tloeg.bbleague.se` / `tourplay.net`) |
| `overrides.bbl` / `overrides.tp` / `overrides.manual` | Star players always included — BBL's numeric typID, TP's own spelling of the star's name, or (for manual) the star's stored name |
| `outputPath` | Base path each report is written next to, timestamped (default `output/report.html`) |

Relative paths resolve against the working directory, which is
`tools/review-star-player/` when the tool is run as documented below.

## Running it

The stack must be running and already imported into.

```bash
pnpm --filter @blood-bowl-tracker/review-star-player run build
pnpm --filter @blood-bowl-tracker/review-star-player run start
```

Exit codes: `0` with `Reviewed <N> star player(s); report written to <path>.` on
success; `1` with `Review failed: <error>` when the database is unreachable or the
config is unusable.

A run scans every downloaded `teams/<rulesSet>/*.json` file once, and every one of
the roughly 216 BBL `p=pt` position pages once, per process — the slowest part of a
run by a wide margin. That cost is the price of not reusing the importers' readers,
which are code under review.

The tool only reads game data. It does connect through `packages/db`'s `DbModule`,
which applies any pending migrations on connect — against a stack deployed from the
same branch that is a no-op.
