# `rosters_<id>.json` (races, positions, teams and players parsed)

See [file-format.md](./file-format.md) for the other pages.

`packages/parse-tp`'s `RosterParserService.parse()` extracts `{ id, teamName,
teamRaceCode, raceName, coachTpId, positions, starPositions, players }`:

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
  becomes `{ tpPositionId: id, name: position, characteristics: { move: ma,
  strength: st, agility: ag, passing: pa, armour: av } }`. `ma`/`st`/`ag`/
  `pa`/`av` are all required integers on every `lineUpMasters[]` entry; a
  literal `0` for `pa` means "cannot pass" (carried through unchanged), not
  "no Passing characteristic" — every rules set TP covers has Passing.
  Positions are grouped by `(unified race, position name)` across all roster
  files, so one identically-named position across rule-set-variant codes of
  one logical race merges onto a single row, collecting every distinct
  `tpPositionId` as TP external ids (all in one upsert call). Positions carry
  a Name external id scoped by race and position name (position names are not
  race-unique), skipped only when the race name fails to resolve.
- `starPositions` — extracted from `rosterMaster.starPlayersMasters[]` (named
  star players permanently embedded in a roster's line-up, as distinct from
  the star players hired for a single match via `inducements_roll` — see
  below), each entry becomes `{ tpPositionId: id, name: position,
  characteristics: { move, strength, agility, passing, armour } }`, same
  shape (and same `ma`/`st`/`ag`/`pa`/`av` source fields) as `positions`.
- `players` — extracted from `lineUps[]`, each entry becomes `{ id, name,
number, lineUpMasterId, rosterId, fallbackPositionName, isBigGuy }`. `id` is
  the per-instance line-up id that `matchEvents[].lineUpId` (see
  [`match_<id>.json`](./file-format-match.md))
  references; `lineUpMasterId` links back to the position template in
  `rosterMaster.lineUpMasters[]` or `starPlayersMasters[]` (the `positions`/
  `starPositions` fields above). `fallbackPositionName` and `isBigGuy` are
  carried straight from the entry's own `position`/`isBigGuy` fields
  (present on every `lineUps[]` entry, standalone or match-embedded) — see
  "Mercenary Big Guys" below for why.

**Races** (via `TpRacesImportService`) group by `raceName` (not code), so all
rule-set-variant codes of one logical race merge onto one row, each code kept
as a TP external id. Each upsert carries the display name as a Name external
id and every era any contributing roster was seen under.

**Positions** (via `TpPositionsImportService`) carry only TP external ids (one
per `tpPositionId` variant). After each upsert, the observed race/era
availability is recorded via `syncRaceEras`. Regular positions import with
`isStarPlayer: false`. `starPositions` (from `starPlayersMasters`) import
separately: grouped by name only (not race — the same named star player is
the same entity regardless of team), upserted with `isStarPlayer: true` and a
bare-name TP external id, matching the hired-star-player convention below so
both paths dedupe onto the same `Position` row. Their ids merge into the same
`positionIdsByTpPositionId` map the regular positions use — see "Embedded
roster star players" below for how that shared map lets these players
resolve.

**Teams** (via `TpTeamsImportService`) are keyed by roster `id` and `teamName`
(one TP and one Name external id). Their race resolves via `raceIdsByTeamRaceCode`
and their coach via `coachIdsByTpId`; a team whose race or coach cannot be
resolved is recorded as an error and skipped.

**Players** (via `TpPlayersImportService`) import every roster's `players`
entry: each resolves a team era (roster id + era, via
`teamErasByRosterId`) and a position (`lineUpMasterId`, via
`positionIdsByTpPositionId`). If that lookup fails but the player is flagged
`isBigGuy: true` (a mercenary Big Guy hire like "Giant", with no catalog
entry in either `rosterMaster` array at all — see "Still not handled" below
for why), it falls back to a reused `isStarPlayer: true` Position keyed by
the player's own inline `fallbackPositionName` (bare-name TP external id),
the same treatment a star player gets. A player whose team era can't be
resolved, or whose position can't be resolved even via that fallback, is
recorded as an error and skipped. Players carry only a TP external id (the
`lineUps[].id`) — no Name external id, since player names aren't guaranteed
unique. Returns `playerIdsByLineUpId`, consumed by match-event import to
resolve a `matchEvents[].lineUpId` to a player.

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
match event's `extraData.starPlayers[]` (see [`match_<id>.json`](./file-format-match.md)), not via any field on the roster file itself. Each hired star player
gets one reused `isStarPlayer: true` Position (a bare-name TP external id)
and a Player scoped to the hiring roster's team-era for the era the hiring
match's competition belongs to. Returns `starPlayerIdsByRosterAndMaster`
(keyed `` `${rosterId}:${lineUpMasterId}` ``); as of this writing no
match-event type references a player by `lineUpMasterId` (touchdown/injury
use `lineUpId`), so this map is currently unconsumed downstream — kept for a
future event type that would need it.

**Embedded roster star players** (permanently on a roster's line-up, as
opposed to the ones hired for a single match via `inducements_roll`):
`positionIdsByTpPositionId` covers both `lineUpMasters` and
`starPlayersMasters` ids, so a `lineUps[]` entry whose `lineUpMasterId`
points into either catalog resolves correctly; no change is needed to
`TpPlayersImportService` or match-event resolution, since both already
resolve generically off that map.

**Mercenary Big Guys** (e.g. "Giant"): a small class of `lineUps[]` entries
whose `lineUpMasterId` isn't present in EITHER `lineUpMasters` or
`starPlayersMasters` for that roster at all — no catalog entry exists,
whether because the player has since left the roster or because mercenaries
use a genuinely different catalog TP doesn't expose per-roster. Unlike a
regular or star position, every `lineUps[]` entry (standalone AND
match-embedded) carries its own position name and Big Guy flag directly
inline (`position: "Giant Mercenary"`, `isBigGuy: true`), regardless of
whether it also resolves via a catalog. `TpRosterPlayer.fallbackPositionName`
carries this inline name; `TpPlayersImportService` uses it (gated on
`isBigGuy`, so a genuine regular-position catalog gap is never masked) as
described above.

**Still not handled** (future work): the other top-level fields on a roster
(`imageFile`, `assistantCoaches`, `cheerLeaders`,
`fanFactor`, `ruleSet`, `necromancer`, `reRolls`, `shortTeamName`, `sponsors`,
`teamColor`, `treasury`, `extraGoldQuantity`, `teamSpecialRules`, `league`,
`hasMatchesInProgress`, `hasMatchesPlayed`, and -- newly observed 2026-07 with
Major Season 30, purely additive with nothing removed or reshaped -- `state`,
`freeHireAndFireOrder`, `apothecary`; the parser reads only the fields it
needs, so these required no code change). Note that the same roster shape
reappears nested as `roster` inside `match` and `inscriptions` bodies — not a
coincidence, but the full shape hasn't been reconciled across all three
contexts. Those nested copies lack `rosterMaster` and are not a source for this
import.
