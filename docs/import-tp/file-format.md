# TP source file format — working notes

Temporary notes on TP's JSON API response mirror, used to coordinate between
development sessions. **Remove an entry once its detail is fully encoded in
code** — the code is the source of truth at that point.

## General

- Layout: `<dataDir>/<era subdirectory>/<competition subdirectory>/*.json`.
  Era subdirectory names are TP's own slugs (e.g. `fourth-era`,
  `second-dungeon-bowl-era`), not necessarily the era's display name — mapped
  via config (`import-tp-config.json5`'s `league.eras[].dataSubdir`).
  Competition subdirectory names are TP's `nameNormalized` slug for the
  tournament (see below) and can be messy: observed examples include
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
  `match`/`inscriptions` files — see below) include a `teamRace` field that
  embeds a rule-set-looking suffix, e.g. `"Snotling_BB2025"`,
  `"Khemri_BB2025"`. Not yet parsed or relied on for anything — a candidate
  for resolving a team's race once roster import lands, but note the
  embedded suffix does NOT necessarily match this project's own rule-set
  names (compare to the opaque `ruleSet` numeric code above, which is the
  field actually used for cross-checking).

## `tournament_<slug>.json` (base file — parsed)

Fully handled in code: `packages/parse-tp`'s `parseTournament()` extracts
only `{ id: number, name: string, ruleSet: number }`. The body carries much
more — `nameNormalized` (the slug used for the competition subdirectory
name), `country`/`locality`/`region`/`address`/`postalCode`, `creationDate`,
`state`, `isNaf`, `isSpecialist`, and a `categories[]` array whose nested
`phases[]` entries carry the tournament's full Blood Bowl ruleset
configuration (`pointsWin`/`pointsDraw`/`pointsDefeat`, `mvpCandidates`,
`weatherAvailables`, `spirallingExpenses`, `expensiveMistakes`, and dozens
more) — none of this is parsed yet; competition import consumes only the
`{ id, name, ruleSet }` already extracted, so it remains out of scope until a
future sub-issue needs it.

## `match_<id>.json` (play date parsed)

`packages/parse-tp`'s `MatchParserService.parse()` now extracts only
`{ id: number, playedDate: Date }` — mapping `matchId` to `id` and resolving
`playedDate` with a three-step fallback: `scoreResume.startInstant` (a
completed match's own recorded start time — the most direct "actually played"
signal TP exposes — see below) when present and non-null, else `scheduledDate`
(the agreed play date, and the best available signal for a match with no
scoreResume yet), else `createdInstant` as a last resort. `createdInstant` is
only a record-setup timestamp (when the match slot was created, e.g. at
schedule generation) and can predate the actual play date by months — it is
deliberately not an earlier fallback. TP competition import uses these dates to
classify a competition as a cup or season by their span. The rest of the body
is still unhandled — a candidate for the matches sub-issue. Notable remaining
fields seen:
`matchId`, `state`, `statePostMatch`, `createdInstant`, `ruleSet`,
`weatherTable`, `round`, `order`, `turn { current, half, ... }`,
`inscriptionLocal.roster { ... }` (see roster shape below, home side only —
need to confirm where the away side's roster is exposed once this file type
is actually parsed), `scoreResume { startInstant, finishInstant }`,
`matchEvents[]`, and — importantly — `scheduledDate`/`endScheduledDate`.
`scheduledDate` (and `scoreResume.startInstant`, which tracks it closely) is
the closest thing to "when the match was actually played" anywhere in TP's
data; there is no tournament- or era-level date-boundary field, so the era
date ranges configured in `import-tp-config.json5` were derived by scanning
every `match_*.json` under each era's directory for the earliest/latest
`scheduledDate` (a one-off manual step during initial config setup, not
something the import tool itself does).

## `rosters_<id>.json` (not yet parsed)

Not yet handled — candidate for a team/roster sub-issue. Top-level fields:
`id`, `imageFile`, `assistantCoaches`, `cheerLeaders`, `fanFactor`, `ruleSet`,
`necromancer`, `reRolls`, `shortTeamName`, `sponsors`, `teamColor`,
`teamName`, `teamRace` (see the rule-set-suffix note above), `treasury`,
`extraGoldQuantity`, `rosterMaster`, `teamSpecialRules`, `league`,
`hasMatchesInProgress`, `hasMatchesPlayed`. The same shape (a subset of these
fields) reappears nested as `roster` inside `match` and `inscriptions`
bodies — not a coincidence, but the full shape hasn't been reconciled across
all three contexts yet.

## `awards_<slug>_awards.json` / `inscriptions_<slug>_inscriptions.json` (not yet parsed)

Not yet handled. Both are objects keyed by category id (a string, e.g.
`"22494"` — matches `tournament.categories[].id` from the base tournament
file), each value an array:

- `inscriptions`: one entry per coach registered in that category —
  `id`, `state`, `inscriptionDate`, `categoryId`, `player { id,
  userNameToShow, nafNumber, nafUser, nafVerified, country, language }`,
  `coachRank { rankOverall, previousRankOverall, rankRegional,
  previousRankRegional, score }`, `roster { ... }` (see roster shape above),
  `hasMatches`.
- `awards`: one entry per award given — `id`, `awardType` (numeric, meaning
  unknown), `inscription.roster { ... }`, `inscription.player.applicationUser
  { applicationUserId, userNameToShow, pictureFileName, country,
  goldStarAwards }`, `inscription.players[]` (empty in samples seen so far),
  `inscription.coachRank.score`.

Both are candidates for a coach/awards sub-issue once that scope is reached.
