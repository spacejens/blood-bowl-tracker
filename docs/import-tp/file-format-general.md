# TP source file format — general notes and entity identifiers

On-disk layout, filename conventions, and how TP's own numeric ids and
rule-set codes are — and are not — used. See
[file-format.md](./file-format.md) for the other pages.

## General

- Layout: `<dataDir>/<era subdirectory>/<competition subdirectory>/*.json`.
  Era subdirectory names are TP's own slugs (e.g. `fourth-era`,
  `second-dungeon-bowl-era`), not necessarily the era's display name — mapped
  via config (`import-tp-config.json5`'s `league.eras[].dataSubdir`).
  Competition subdirectory names are TP's `nameNormalized` slug for the
  tournament (see [`tournament_<slug>.json`](./file-format-tournament.md)) and can be messy: observed examples include
  `-ogretoberfest-12--` (stray leading/trailing hyphens) and
  `tournament_..._clasifications?type=COACH.json`-style filenames that embed a
  literal `?type=COACH` query string (preserved verbatim from the mirrored
  API URL, not a real query string on disk).
- Files are JSON (unlike BBL's HTML), one JSON document per file. Encoding is
  UTF-8.
- Filename convention: `<type>_<rest>.json`, where `type` is the text before
  the first `_` (the whole basename minus `.json` when there's no `_`). Types
  seen in the reference dataset: `match`, `rosters`, `tournament`, `awards`,
  `inscriptions`.
- `tournament_*` files have a base form and several suffix variants that
  share the same `tournament_` prefix but carry additional detail for one
  tournament: `tournament_<slug>.json` (base — the only variant parsed so
  far), `tournament_<slug>_coach-stats.json`, `tournament_<slug>_team-stats.json`,
  `tournament_<slug>_lineup-stats.json`, `tournament_<slug>_statistics.json`,
  `tournament_<slug>_news.json`, `tournament_<slug>_clasifications?type=COACH.json`,
  `tournament_<slug>_phases?type=COACH.json`. Since TP slugs use hyphens, never
  underscores, the base file is distinguished from its variants by a regex
  requiring no further `_` after the `tournament_` prefix
  (`isBaseTournamentFile` in `tp-source-reader.ts`:
  `/^tournament_[^_]+\.json$/`).

## Entity identifiers

- TP's own numeric ids (`tournament.id`, `match.matchId`, roster `id`, etc.)
  are internal to TP and not currently used as external ids for anything —
  era and rule-set identity are fully operator-config-supplied (see
  [index.md](./index.md)), since TP's data carries no human-readable name for
  either.
- `tournament.ruleSet` (and the same field mirrored on `match` and `rosters`
  bodies) is an **opaque numeric code** with no name anywhere in the API
  response — e.g. `20` for `third-era`, `21` for `second-dungeon-bowl-era`,
  `25` for `fourth-era` in the reference dataset, all internally consistent
  within their era's directory. TP's own meaning for these codes is unknown;
  the code is used only as a cross-check that every tournament under one
  era's directory agrees (`TpErasImportService`'s consistency check), never
  as the source of a rule-set's display name.
- Roster bodies (both `rosters_<id>.json` and the `roster` object nested in
  `match`/`inscriptions` files — see [`match_<id>.json`](./file-format-match.md)
  and [`inscriptions_<slug>_inscriptions.json`](./file-format-inscriptions.md))
  include a `teamRace` field that
  embeds a rule-set-looking suffix, e.g. `"Snotling_BB2025"`,
  `"Khemri_BB2025"`. Parsed as `teamRaceCode` (see [`rosters_<id>.json`](./file-format-rosters.md)) and
  used to resolve each team's/position's race via `raceIdsByTeamRaceCode`
  during races/teams/positions import, but note the embedded suffix does NOT
  necessarily match this project's own rule-set names (compare to the opaque
  `ruleSet` numeric code above, which is the field actually used for
  cross-checking).
