# review-match

`tools/review-match` renders a side-by-side HTML report comparing each import
source's **raw** match data against what the importers actually stored in
`game_data.match_events`. It is a review aid for a human: it cannot decide what
is "correct" on its own, because the interpretation logic it deliberately does
not run is the thing being reviewed.

**Architectural boundary:** the raw-source panels never depend on
`packages/parse-tp`, `tools/import-tp`, or `tools/import-bbl` — not just for
player-id resolution, but for any decoding or lookup, including ones that look
like safe shared domain knowledge (e.g. weather-code tables). Any "friendly
value" the raw panels show (a hint next to a numeric code, a resolved player
name, a decoded weather condition) is built from a hand-written table or a
lookup over the raw source file itself, kept independent of the corresponding
parser/importer logic on purpose: reusing that logic here would let a bug in
it agree with review-match's display instead of showing up as a difference,
defeating the tool's reason for existing. For the same reason,
`MatchCategoryLabelService` (in `tools/review-match/src/shared/`) is
deliberately duplicated from the Discord bot's own label service of the same
name rather than shared — the six-word title-casing it does isn't behaviour
worth coupling two independent tools over.

That rule covers this tool's **domain-specific** half — raw-source parsing,
comparison predicates and label/lookup tables — and nothing else. The
domain-agnostic scaffolding (HTML fragment assembly, timestamped report
writing, JSON5 config loading, the `DataTypeReviewer`/`Stratifier` plug-in
contracts and the app-module wiring) is shared on purpose with
`tools/review-player` via `packages/review-harness`: a bug there cannot "agree
with itself" against a raw source, because that code never touches a source's
meaning. The report document is shared the same way: `report-builder.service.ts` and
`review.service.ts` are thin subclasses of the harness's
`ReportBuilderBase`/`ReviewServiceBase`, adding only the per-match section and
the match-result lookup. `harness.module.ts` stays local because it _is_ this
tool's own composition.

Scope today is match events; the tool is structured so a future data type
(rosters, standings) plugs in as another module without touching the harness
services.

## What it does

1. Samples matches per source (BBL and TP) across twelve strata — a few
   matches each, `matchesPerStratum` (default 3) per stratum:
   1. contains a foul
   2. contains a casualty or death
   3. an action paired with a matched consequence
   4. an action _without_ a matched consequence
   5. a journeyman, star or mercenary participant (BBL only)
   6. a consequence avoided by apothecary or regeneration (BBL only)
   7. a four-team match merged from two BBL source rows (BBL only)
   8. a cup final match
   9. a season semi-final match
   10. a season final match
   11. a season bronze match
   12. a season qualifier match

   Strata 8–12 filter directly on `matches.category`; `normal` (the
   overwhelming majority of matches) gets no dedicated stratum of its own,
   since it needs no deliberate inclusion the way a rare category does.
2. Adds every match id listed in `overrides`, whatever the strata picked.
3. Each match's heading always carries its `game_data.matches.category`
   (e.g. `Round 3 [Cup Final]`) — including `normal`, unlike the Discord bot's
   "only show when notable" choice, because review-match is a QA aid where
   confirming a routine match really was imported as routine has value.
4. Each match section shows a score line (every participating team and its
   touchdown count) and the outcome (the winning team's name, or "Draw"),
   rendered as its own block right under the heading — never appended to the
   heading text — with a note in its place when the match has no
   `match_teams` rows at all. "Draw" here means `winning_match_team_id IS
   NULL`, which is indistinguishable from an unresolved outcome — the schema
   deliberately has no third "unknown" state, so an importer that cannot
   resolve a match's winner is expected to fail loudly rather than write NULL
   for that reason.
5. For each sampled match, renders two panels:
   - **Raw source** — the BBL mirror page's `table.tblist` rows as plain text,
     or the TP `match_<id>.json`'s `matchEvents[]` entries with their numeric
     codes. A BBL four-team match that the importer merged from two two-team
     source rows shows both source pages' tables stacked, each under a
     `Source match <id>` heading, since its single imported panel holds the
     union of both. Neither panel uses the importers' interpretation logic, so
     an importer bug shows up as a difference instead of being mirrored. TP's
     raw panel also shows hand-written `(label)` hints next to the
     numeric event code and, for a weather event, next to the weather code
     (which TP only makes unique _within_ its weather table, so both numbers
     are read together) — treat the codes as the authoritative data and the
     labels as reading aids only; the label tables necessarily describe the
     same meanings as `packages/parse-tp`'s real decoders, so they can't
     independently catch a decoder that's simply wrong about what a code
     means. A `Summary` column names the player an event is about (`Player:
     <name>`), resolved from the same raw match file's own
     `inscription{Local,Visitor}` line-ups (an id that resolves to nothing is
     shown as `Player: unknown id <N>` rather than blanked, so the gap is
     visible), with the injury outcome appended for an injury event and the
     turn number appended whenever the raw event carries one (e.g. `Player:
     Grim Ironjaw (Dead, turn 7)` for an injury on turn 7, or `Player: Grim
     Ironjaw (turn 3)` for a foul with no injury outcome); lists the star
     players an inducements
     event induced and/or the treasury portion of the spend (e.g. `Griff
     Oberwald; Treasury: 50000`); shows the per-side fan-factor change on a
     dedicated-fans event (e.g. `Dedicated fans: local +1, visitor -1`); or,
     for a weather event, names the decoded weather condition (e.g. table
     13's code `40` is `40 (very sunny)`, though the same code `40` means
     `pouring rain` in the classic table 0 — a reminder that the code is only
     unique within its table). Each event's remaining raw JSON sits behind a
     collapsed `expand` disclosure so a long match stays scannable.
   - **Imported** — the `game_data.match_events` rows for that match, with
     players and teams resolved to names.
6. Writes the report under `tools/review-match/output/` (gitignored) with a
   timestamp inserted into the filename (e.g. `report-2026-07-27T19-15-00Z.html`)
   so successive runs don't overwrite each other's reports, and prints where
   it landed.

Strata that match nothing, and override ids that are not in the database, are
reported as gaps in the report (and as console warnings) — never as failures.

## Configuration

Copy the template and edit it:

```bash
cp tools/review-match/review-match-config.example.json5 tools/review-match/review-match-config.json5
```

| Key | Meaning |
| --- | --- |
| `database.url` | Connection string of the database holding the imported data (required) |
| `matchesPerStratum` | Matches sampled per stratum, per source (default 3) |
| `bbl.dataDir` / `tp.dataDir` | The same downloaded data directories `tools/import-bbl` / `tools/import-tp` read |
| `bbl.externalSystemName` / `tp.externalSystemName` | External-system names the imports registered records under (default `BBL` / `TP`) |
| `overrides.bbl` / `overrides.tp` | External match ids always included |
| `outputPath` | Base path each report is written next to, timestamped (default `output/report.html`, e.g. `output/report-2026-07-27T19-15-00Z.html`) |

Relative paths resolve against the working directory, which is
`tools/review-match/` when the tool is run as documented below.

## Running it

The stack must be running and already imported into — see `deploy-local`,
which can also run this tool for you and open the report.

```bash
pnpm --filter @blood-bowl-tracker/review-match run build
pnpm --filter @blood-bowl-tracker/review-match run start
```

Exit codes: `0` with `Reviewed <N> match(es); report written to <path>.` on
success; `1` with `Review failed: <error>` when the database is unreachable or
the config is unusable. Open the path printed on success — each run writes
its own timestamped file under `tools/review-match/output/`, so the most
recent one isn't necessarily named the same as a previous run's.

The tool only reads game data. It does connect through `packages/db`'s
`DbModule`, which applies any pending migrations on connect — against a stack
deployed from the same branch that is a no-op.
