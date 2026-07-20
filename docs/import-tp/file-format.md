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
  `"Khemri_BB2025"`. Parsed as `teamRaceCode` (see roster section below) and
  used to resolve each team's/position's race via `raceIdsByTeamRaceCode`
  during races/teams/positions import, but note the embedded suffix does NOT
  necessarily match this project's own rule-set names (compare to the opaque
  `ruleSet` numeric code above, which is the field actually used for
  cross-checking).

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

## `match_<id>.json` (play date and name parsed)

`packages/parse-tp`'s `MatchParserService.parse()` extracts
`{ id: number, playedDate: Date, name: string }` — mapping `matchId` to `id`,
building `name` from `group.phase.roundName` title-cased plus `round` (e.g.
`"Round 3"`, `"Day 2"`; only `"ROUND"` and `"DAY"` roundNames appear in the
dataset, but the field is treated as an arbitrary string), and resolving
`playedDate` with a three-step fallback: `scoreResume.startInstant` (a
completed match's own recorded start time — the most direct "actually played"
signal TP exposes — see below) when present and non-null, else `scheduledDate`
(the agreed play date, and the best available signal for a match with no
scoreResume yet), else `createdInstant` as a last resort. `createdInstant` is
only a record-setup timestamp (when the match slot was created, e.g. at
schedule generation) and can predate the actual play date by months — it is
deliberately not an earlier fallback. TP competition import uses these dates to
classify a competition as a cup or season by their span. `TpMatchesImportService`
then imports each match as a `Match` row linked to its competition (via the
directory scan, since a match file carries no tournament id — see below),
carrying only a TP external id (the stringified `matchId`); match names are not
unique, so they are never used as an external id. The rest of the body is still
unhandled — match events and team-era linkage are issue #198. Notable remaining
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

## `rosters_<id>.json` (races, positions and teams parsed)

`packages/parse-tp`'s `RosterParserService.parse()` extracts `{ id, teamName,
teamRaceCode, raceName, coachTpId, positions }`:

- `id` — TP's roster id, used as a TP external id for teams.
- `teamName` — the team's registered name, used as a Name external id for teams.
- `teamRaceCode` — extracted from the `teamRace` field (which carries a
  rule-set-looking suffix like `"Dwarf"` or `"Snotling_BB2025"`). This code
  is looked up in the `raceIdsByTeamRaceCode` map from `TpRacesImportService`
  to resolve which race row each team belongs to.
- `raceName` — extracted from `rosterMaster.name`, the display name for the
  race (e.g. `"Dwarf"`, `"Skaven"`, `"Snotling"`). Stable across every
  rule-set-variant code of the same logical race.
- `coachTpId` — extracted from `player.applicationUserId`, TP's stable coach
  account id. Looked up in `coachIdsByTpId` from `TpCoachesImportService` to
  resolve the team's coach.
- `positions` — extracted from `rosterMaster.lineUpMasters[]`, each entry
  becomes `{ tpPositionId: id, name: position }`. Positions are grouped by
  `(unified race, position name)` across all roster files, so one
  identically-named position across rule-set-variant codes of one logical race
  merges onto a single row, collecting every distinct `tpPositionId` as TP
  external ids (all in one upsert call). Positions carry no Name external id
  (position names are not race-unique).

**Races** (via `TpRacesImportService`) group by `raceName` (not code), so all
rule-set-variant codes of one logical race merge onto one row, each code kept
as a TP external id. Each upsert carries the display name as a Name external
id and every era any contributing roster was seen under.

**Positions** (via `TpPositionsImportService`) carry only TP external ids (one
per `tpPositionId` variant). After each upsert, the observed race/era
availability is recorded via `syncRaceEras`. All positions import with
`isStarPlayer: false`; `starPlayersMasters` is not parsed (see below).

**Teams** (via `TpTeamsImportService`) are keyed by roster `id` and `teamName`
(one TP and one Name external id). Their race resolves via `raceIdsByTeamRaceCode`
and their coach via `coachIdsByTpId`; a team whose race or coach cannot be
resolved is recorded as an error and skipped.

**Still not handled** (future work): `rosterMaster.starPlayersMasters` (star
players — the field isn't declared in `RosterSchema`, so it's dropped
unconditionally by the parser regardless of dataset content, not merely
because the reference dataset happens to have none; revisit once match-event
data — issue #198 — surfaces a real star-player sample to parse against), and
the other top-level fields (`imageFile`, `assistantCoaches`, `cheerLeaders`,
`fanFactor`, `ruleSet`, `necromancer`, `reRolls`, `shortTeamName`, `sponsors`,
`teamColor`, `treasury`, `extraGoldQuantity`, `teamSpecialRules`, `league`,
`hasMatchesInProgress`, `hasMatchesPlayed`). Note that the same roster shape
reappears nested as `roster` inside `match` and `inscriptions` bodies — not a
coincidence, but the full shape hasn't been reconciled across all three
contexts. Those nested copies lack `rosterMaster` and are not a source for this
import.

## `inscriptions_<slug>_inscriptions.json` (coaches parsed)

`packages/parse-tp`'s `InscriptionsParserService.parseCoaches()` extracts every
registered coach. The file is an object keyed by category id (a string, e.g.
`"22494"` — matches `tournament.categories[].id` from the base tournament
file), each value an array of registration entries. Only each entry's `player`
object is consumed, yielding `{ id: string, name: string, nafNumber?: number }`
per coach:

- `player.id` — TP's own stable internal account GUID; identical for the same
  coach across every competition and era. Used as the canonical TP external id.
- `player.userNameToShow` — the coach's display name (trimmed). Used as the
  Name external id.
- `player.nafNumber` — the coach's NAF number when NAF-linked (absent for some
  coaches). When present, used as a NAF external id (stringified).

The rest of each entry is unhandled — `state`, `inscriptionDate`, `categoryId`,
the other `player` fields (`nafUser`, `nafVerified`, `country`, `language`),
`coachRank { ... }`, `roster { ... }` (see roster shape above), and
`hasMatches`. `roster` here is a nested copy that lacks `rosterMaster` and,
per the rosters section above, is not a source for team import.

## `awards_<slug>_awards.json` (not yet parsed)

Not yet handled. An object keyed by category id (a string, e.g. `"22494"`),
each value an array — one entry per award given: `id`, `awardType` (numeric,
meaning unknown), `inscription.roster { ... }` (see roster shape above),
`inscription.player.applicationUser { applicationUserId, userNameToShow,
pictureFileName, country, goldStarAwards }`, `inscription.players[]` (empty in
samples seen so far), `inscription.coachRank.score`. This is a redundant, less
complete view of the coaches already imported from inscriptions (no NAF
fields) — a candidate for an awards sub-issue once that scope is reached.
