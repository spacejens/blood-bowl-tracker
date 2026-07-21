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
unique, so they are never used as an external id. The parser also reads
`inscriptionLocal.roster.id` / `inscriptionVisitor.roster.id` (the home/away
team roster ids); `TpTeamParticipationImportService` resolves these to team-era
ids and re-upserts each match with its `match_teams`, and derives each
competition's `competition_teams` from which roster files appear under its
directory.

`matchEvents[]` — TP's per-roll event log for the match — is decoded by
`packages/parse-tp`'s `parseMatchEvents()` into `TpMatchEvent[]`, keyed by the
raw numeric `matchEventType` code. **Modeled codes**: `4` touchdown
(`lineUpId`, scoring roster's `rosterId`); `8` injury (`lineUpId`, victim
`rosterId`, optional `turnRosterId` — the acting team's roster id when
present — and `injuryType`); the administrative rolls `10` weather,
`11` inducements (incl. any hired star players, `extraData.starPlayers[]`),
`12` winnings, `13` fan factor, `14` expensive mistake, `15` journeyman
signing, `20` concession, `23` prayers to Nuffle, `26` dedicated fans, and
`42` secret objective. **Skip-listed codes** — dropped unconditionally,
along with any unrecognized code, so new/unmapped TP codes never crash the
import: `0, 1, 3, 5, 6, 7, 18, 19, 25, 27, 31, 32, 46` — these are structural
markers or per-roll noise with no useful modeled payload (e.g. code `27`,
"player assigned to line-up", is a structural row, not a modeled roll). A
`None` `injuryType` is still returned by the parser (a real "no injury"
roll outcome) but skipped by the import step, emitting no event.

`tools/import-tp`'s `TpMatchEventsImportService` turns each decoded event
into zero, one, or two `UpsertMatchEvent`s (see
[index.md](./index.md#architecture)). Unlike BBL, which correlates
separately scraped action/consequence occurrences, TP embeds the
acting/victim player and team directly on the event, so no correlation step
is needed. A touchdown becomes an `actionType: 'touchdown'` event scoped to
the scorer. An injury's `injuryType` maps to a `consequence_type` via:

| `injuryType`    | `consequence_type`  |
| --------------- | -------------------- |
| `MissNextGame`  | `miss_next_game`     |
| `NigglingInjury`| `niggling_injury`    |
| `Dead`          | `death`               |
| `AV`            | `stat_reduction_av`   |
| `ST`            | `stat_reduction_st`   |
| `MA`            | `stat_reduction_ma`   |
| `PA`            | `stat_reduction_pa`   |
| `AG`            | `stat_reduction_ag`   |

When the injury's `turnRosterId` is present and differs from the victim's
`rosterId` (an opponent caused it), the event also carries an `actionType` —
`'death'` for a `Dead` injury, else `'casualty'` — crediting the acting
team; a `turnRosterId` equal to the victim's roster (or absent) means the
injury was self-inflicted (e.g. a failed dodge), so only the consequence
side is emitted. Every administrative event sets exactly one typed payload
column (e.g. `weatherType`, `inducementsCost`, `winnings`, `fanFactor`,
`journeymenCount`, `expensiveMistake`, `dedicatedFans`, `secretObjective`,
`prayersToNuffle`); "both-sides" events (winnings, fan factor, dedicated
fans) emit two records, one per team, with `-home`/`-away`-suffixed
external ids. Every event's external id is `tp-<tpEventId>` (or its
suffixed variant), synthesized from `matchEvents[].id`.

Notable remaining fields seen: `matchId`, `state`, `statePostMatch`,
`createdInstant`, `ruleSet`, `weatherTable`, `round`, `order`,
`turn { current, half, ... }`,
`inscriptionLocal.roster { id, lineUps, ... }` /
`inscriptionVisitor.roster { id, lineUps, ... }` (the home/away teams — each
side's roster `id` is parsed into `homeTeamTpId`/`awayTeamTpId`, and its
`lineUps[]` — a per-match snapshot of that side's roster, same shape as the
standalone roster file's own `lineUps[]` — is parsed into
`homeRosterPlayers`/`awayRosterPlayers`, see the players section below; the
rest of these nested roster bodies remains unhandled), `scoreResume
{ startInstant, finishInstant }`, and — importantly — `scheduledDate`/
`endScheduledDate`.
`scheduledDate` (and `scoreResume.startInstant`, which tracks it closely) is
the closest thing to "when the match was actually played" anywhere in TP's
data; there is no tournament- or era-level date-boundary field, so the era
date ranges configured in `import-tp-config.json5` were derived by scanning
every `match_*.json` under each era's directory for the earliest/latest
`scheduledDate` (a one-off manual step during initial config setup, not
something the import tool itself does).

## `rosters_<id>.json` (races, positions, teams and players parsed)

`packages/parse-tp`'s `RosterParserService.parse()` extracts `{ id, teamName,
teamRaceCode, raceName, coachTpId, positions, players }`:

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
- `players` — extracted from `lineUps[]`, each entry becomes `{ id, name,
  number, lineUpMasterId, rosterId }`. `id` is the per-instance line-up id
  that `matchEvents[].lineUpId` (see below) references; `lineUpMasterId`
  links back to the position template in `rosterMaster.lineUpMasters[]` (the
  `positions` field above).

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

**Players** (via `TpPlayersImportService`) import every roster's `players`
entry: each resolves a team era (roster id + era, via
`teamErasByRosterId`) and a position (`lineUpMasterId`, via
`positionIdsByTpPositionId`); a player whose team era or position can't be
resolved is recorded as an error and skipped. Players carry only a TP
external id (the `lineUps[].id`) — no Name external id, since player names
aren't guaranteed unique. Returns `playerIdsByLineUpId`, consumed by
match-event import to resolve a `matchEvents[].lineUpId` to a player.

Player identity is sourced from BOTH `rosters_<id>.json`'s top-level
`lineUps[]` (a roster's CURRENT composition, as of when the local TP data
mirror was downloaded) AND each `match_<id>.json`'s
`inscriptionLocal.roster.lineUps[]` / `inscriptionVisitor.roster.lineUps[]`
(a per-match historical snapshot of that side's roster at match time, parsed
into `MatchParserService`'s `homeRosterPlayers`/`awayRosterPlayers`). This is
because a player who has since left/been replaced on a roster is silently
absent from the standalone roster file, even though historical
`matchEvents[]` (in this or another match) can still reference them by
`lineUpId` — without the match-embedded snapshot, that player's identity
(and thus the event's player attribution) is lost. `main.ts` pre-scans every
match's `homeRosterPlayers`/`awayRosterPlayers`, grouping them by roster id
into `matchEmbeddedPlayersByRosterId`, and `TpPlayersImportService` merges
each roster's match-embedded players with `roster.players`, keyed by player
id — the standalone file's data wins on conflict for a given id (presumed
freshest), so the match-embedded snapshot only fills in ids the standalone
file doesn't list. The service also imports **hired star players** — named via an `inducements_roll`
match event's `extraData.starPlayers[]` (see the `match_<id>.json` section
below), not via any field on the roster file itself. Each hired star player
gets one reused `isStarPlayer: true` Position (a bare-name TP external id)
and a Player scoped to the hiring roster's team-era for the era the hiring
match's competition belongs to. Returns `starPlayerIdsByRosterAndMaster`
(keyed `` `${rosterId}:${lineUpMasterId}` ``); as of this writing no
match-event type references a player by `lineUpMasterId` (touchdown/injury
use `lineUpId`), so this map is currently unconsumed downstream — kept for a
future event type that would need it.

**Still not handled** (future work): `rosterMaster.starPlayersMasters` (the
roster's full star-player *catalog*, as opposed to the star players actually
hired in a match — the field isn't declared in `RosterSchema`, so it's
dropped unconditionally by the parser regardless of dataset content), and
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
