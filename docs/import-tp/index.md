# import-tp

`tools/import-tp/` imports data from TP into the tracker. The source data is
a set of JSON API responses, laid out as one subdirectory per era, with a
per-competition subdirectory inside each era (e.g.
`data/fourth-era/tloegbbl-chaos-cup-8/`). Unlike BBL's HTML mirror, TP's
files are JSON.

## Configuration

Configuration is supplied through a JSON5 file, `import-tp-config.json5`, in the
tool directory (`tools/import-tp/`). JSON5 allows comments and trailing commas,
so the era list can be documented inline. Top-level keys:

- `connection` — runtime settings for reaching the api-server to import into.
  The group itself is required.
  - `apiBaseUrl` — base URL of the running api-server. Defaults to
    `http://localhost:3000` if unset.
  - `apiToken` — **required.** The bearer token this tool authenticates with;
    the api-server rejects unauthenticated requests with `401`. Must match the
    `API_TOKEN_IMPORT_TP` value in `apps/discord-bot/.env` (see
    [RPC conventions](../api/rpc-conventions.md)). Treat it like a password —
    `import-tp-config.json5` is git-ignored, so it is never committed.
- `externalSystemName` — name of the external system TP records are
  registered under. Defaults to `"TP"` if unset or empty.
- `dataDir` — path to the folder that directly contains one subdirectory per
  era. This is a subfolder of the git-ignored `data/` directory. A relative
  path resolves against the current working directory.
- `league` — everything that describes the league being imported: its name
  and the eras it played through. Rule sets and eras are not present in TP's
  data (only an opaque numeric rule-set code is), so they are supplied here,
  same as `import-bbl-config.json5`.
  - `name` — the league's display name. Used as the league's external ID
    under both the TP and Name external systems.
  - `eras` — an array mapping each era to its data subdirectory and rule
    sets:
    - `identity.name` — the era's display name in the database.
    - `identity.rulesSets` — a non-empty array of rule-set names the era
      spans, in chronological order.
    - `dates.startDate` — the era's start date (required, `YYYY-MM-DD`).
    - `dates.endDate` — the era's end date (optional; omit for an era still
      ongoing).
    - `dataSubdir` — the subdirectory under `dataDir` holding that era's TP
      files. TP's subdirectory names are its own slugs and don't necessarily
      match the era's display name. Every `identity.name` and every
      `dataSubdir` must be unique across the array.

See `import-tp-config.example.json5` for a worked example with real era
names, rule sets, and dates.

Rule-set names and era dates are config-supplied because TP's data carries
only an opaque numeric rule-set code, not a name or a date range. The tool
still reads that code out of each era's data files and cross-checks it's
consistent within the era directory — a diagnostic that catches data
misplaced under the wrong era subdirectory, not a source of truth for naming.

## Data layout

The tool expects, under `dataDir`:

```
<dataDir>/
  <era.dataSubdir>/
    <competition>/
      match_<id>.json
      rosters_<id>.json
      tournament_<slug>.json
      tournament_<slug>_coach-stats.json
      awards_<slug>_awards.json
      ...
```

Each file's "type" is the filename text before the first `_` (or the whole
basename when there is no `_`) — e.g. `match`, `rosters`, `tournament`,
`awards`, `inscriptions`.

## Run it

1. Copy the template and fill in real values:
   ```bash
   cp tools/import-tp/import-tp-config.example.json5 tools/import-tp/import-tp-config.json5
   ```
   `tools/import-tp/import-tp-config.json5` is git-ignored, so your
   configuration is never committed.
2. Build and run the tool so the config file is picked up automatically:
   ```bash
   pnpm --filter @blood-bowl-tracker/import-tp run build
   pnpm --filter @blood-bowl-tracker/import-tp run start
   ```
   This performs a real import against a running api-server (see
   `connection.apiBaseUrl`). Sample success output:
   ```
   Imported 5 record(s) successfully.
   ```
   On failure, the tool exits with a non-zero status and prints each error.

## Architecture

- **ImportTpConfigService** — loads `import-tp-config.json5` (JSON5), exposing
  raw top-level values via `get<T>(key)` and the api-server base URL via
  `getApiBaseUrl()`. A missing file is treated as empty so each getter throws
  its own friendly error.
- **ExternalSystemNameConfigService** — resolves the `externalSystemName`
  config key, defaulting to `"TP"`.
- **LeagueConfigService** — reads the `league.name` config key.
- **EraDataConfigService** — reads the `league.eras` array into structured
  entries (`identity`, `dates`, `dataSubdir`), validating each field and
  enforcing unique era names and data subdirectories.
- **SourceModule** — the reusable traversal core. `SourceConfigService`
  resolves `dataDir` against the current working directory; `TpSourceReader`
  walks `<dataDir>/<era>/<competition>/*.json` and streams one `TpSourceFile`
  per file (era name, competition, type, filename, JSON-parsed content),
  keeping only one file in memory at a time. This is the pattern future
  data-type extractors reuse.
- **TpLeaguesImportService** — upserts the league from `league.name`, under
  both the TP and Name external systems.
- **TpRulesSetsImportService** — upserts the rule sets named across
  `league.eras[].identity.rulesSets`.
- **TpErasImportService** — upserts each configured era, linking it to the
  league and its rule sets. Also cross-checks TP's numeric rule-set code for
  consistency within each era's data directory, using `parseTournament` from
  `packages/parse-tp`.
- **TpCompetitionsImportService** — upserts each competition found under the
  era directories. A competition is one `<era>/<competition>` subdirectory: its
  base `tournament_<slug>.json` gives the name and TP id, its `match_*.json`
  files give the dates whose span classifies it (span ≤ 3 days ⇒ cup, else
  season), and its era is the directory's own era (looked up in the
  `eraIdsByName` map from `TpErasImportService`, with no date-range matching —
  unlike BBL). Uses `MatchParserService` and `TournamentParserService` from
  `packages/parse-tp`. Each competition carries a TP external id (the
  stringified tournament id). Competitions missing a base tournament file,
  with an unparsable one, with no dated matches, or whose era has no known id
  are skipped with a recorded error.
- **TpMatchesImportService** — upserts each match as a `Match` row linked to its
  competition. Match files carry no tournament id, so matches are linked via the
  directory scan `TpCompetitionsImportService` already performs: it exposes a
  `matchesByCompetitionId` map (keyed by DB competition id) that this service
  consumes rather than scanning the source files itself. Each match carries a TP
  external id (the stringified `matchId`) and no Name external id (match names
  are not unique); team-era linkage (`match_teams`) is handled by
  `TpTeamParticipationImportService` and match events by
  `TpMatchEventsImportService`, both below.
- **TpCoachesImportService** — upserts every coach registered to a competition,
  read from each competition's `inscriptions_<slug>_inscriptions.json` file via
  `InscriptionsParserService` from `packages/parse-tp`. Coaches are deduped
  globally by TP's stable `player.id` and keyed under three external systems:
  TP (canonical, by `player.id`), Name (by the coach's name), and NAF (by the
  coach's NAF number — only when present). Returns a `coachIdsByTpId` map that a
  later team-import sub-issue will use to resolve each team's coach; unused here.
- **TpRacesImportService** — upserts each race from the roster files, grouped
  by display name (`rosterMaster.name`) so rule-set-variant codes merge onto
  one row. Each upsert carries every distinct code as a TP external id (all in
  one call for merge semantics), the display name as a Name external id, and
  every era any contributing roster was seen under. Returns `raceIdsByTeamRaceCode`
  keyed by code for the positions/teams imports to resolve their races.
- **TpTeamsImportService** — upserts each team (keyed by roster id + name),
  resolving race via `raceIdsByTeamRaceCode` and coach via `coachIdsByTpId`;
  skips any team whose race or coach cannot be resolved. Teams are grouped by
  id so one seen under multiple eras unions its eras.
- **TpPositionsImportService** — upserts each regular position grouped by
  `(race, name)`, keyed by its `tpPositionId` variants (all in one upsert call
  for merge semantics). Carries TP external ids only (one per `tpPositionId`);
  after each upsert, records race/era availability via `syncRaceEras`. Star
  players permanently embedded in a roster's line-up (`rosterMaster.
starPlayersMasters`, distinct from `lineUpMasters`) are parsed separately and
  grouped by name only — not race, since the same named star player is the
  same entity regardless of team — then upserted with `isStarPlayer: true` and
  a bare-name TP external id (matching the convention the hired-star-player
  path below already uses, so both paths dedupe onto the same `Position` row).
  Their ids merge into the same `positionIdsByTpPositionId` map the regular
  positions use; a star catalog id that collides with an already-mapped id is
  skipped with a non-fatal error instead of overwriting it.
- **TpPlayersImportService** — imports every roster player instance from
  `lineUps[]`: each resolves a team era (roster id + era, via
  `teamErasByRosterId`) and a position (`lineUpMasterId`, via
  `positionIdsByTpPositionId`); if that fails but the player is a mercenary
  Big Guy (`isBigGuy: true`, e.g. "Giant" — no catalog entry in either
  `rosterMaster` array at all), it falls back to a reused `isStarPlayer: true`
  Position keyed by the player's own inline `fallbackPositionName`, the same
  treatment a star player gets. A player whose team era or position (even via
  that fallback) can't be resolved is recorded as an error and skipped.
  Players carry only a TP external id (no Name external id — player names
  aren't unique). Returns
  `playerIdsByLineUpId`, consumed by match-event import to resolve a
  `matchEvents[].lineUpId`. Also consumes `matchEmbeddedPlayersByRosterId`
  from `main.ts`'s pre-scan of `matchesByCompetitionId` (each match's
  `homeRosterPlayers`/`awayRosterPlayers` — a per-match roster snapshot
  parsed by `MatchParserService`, grouped by roster id): for each roster it
  merges these match-embedded players with `roster.players`, keyed by
  player id, so a player who has since left/been replaced on the roster
  (absent from the standalone `rosters_<id>.json` file) is still imported,
  with `roster.players`' own data winning on conflict for a given id — see
  [file-format.md](./file-format.md#rosters_idjson-races-positions-teams-and-players-parsed)
  for why. Also imports every star player hired via an `inducements_roll`
  match event (gathered by `main.ts` from the already-parsed match events,
  not from any roster field), each getting a reused `isStarPlayer: true`
  Position and a Player scoped to the hiring roster's team-era; returns
  `starPlayerIdsByRosterAndMaster`, keyed
  `` `${rosterId}:${lineUpMasterId}` `` (currently unconsumed downstream — no
  match-event type references a player by `lineUpMasterId` yet). Also returns
  `starPositionUsages`: one `{ positionId, teamRaceCode, era }` entry per
  imported star-position player, across all four star sources above (embedded
  roster, match-embedded, mercenary Big Guy, inducements-hired) — consumed by
  `TpPositionRaceErasImportService`, below, to populate `positions_race_eras`
  for star positions.
- **TpPositionRaceErasImportService** — populates `positions_race_eras` rows
  for star positions, which get none from `TpPositionsImportService`'s
  `syncRaceEras` calls (star positions are grouped by name only, not race, so
  there's no `raceId` to sync against at that point). TP states no explicit
  availability for star positions, so this step derives it from actual usage:
  it resolves each `StarPositionUsage`'s raw `teamRaceCode`/`era` to numeric
  `(raceId, eraId)` via the maps the races/eras imports already produced,
  dedupes the pairs per position, and calls `syncRaceEras` once per star
  position. A usage whose race or era can't be resolved is recorded as a
  non-fatal error and skipped; the rest still process. Runs after players
  import, since star usage (which team/race/era fielded or hired a given
  star) is only known once players are imported. Idempotent, like the regular
  position sync — `syncRaceEras` is upsert-only.
- **TpTeamParticipationImportService** — populates `match_teams` and
  `competition_teams` for the already-imported matches and competitions. Runs
  after teams import (it needs each team's resolved team-era ids) and consumes
  only maps the earlier steps produced plus the shared `rosters` list — no new
  file scanning. For each competition it resolves the roster ids of the roster
  files under its own directory to team-era ids and re-upserts the competition
  with those `teamEraIds` (writing `competition_teams`); it then re-upserts each
  match with its `[home, away]` team-era ids, resolved from the roster ids the
  parser reads out of each match file (writing `match_teams`). Both writes are
  additive/idempotent; unlike BBL, TP needs no page scraping because it embeds
  both teams' roster ids per match and a roster file's directory placement is
  the competition-membership signal.
- **TpMatchEventsImportService** — imports touchdown, injury/casualty, and
  administrative match events from every already-parsed TP match's
  `matchEvents[]` (see
  [file-format.md](./file-format.md#match_idjson-play-date-and-name-parsed)
  for the full decode table). Unlike BBL, which correlates separately
  scraped action/consequence occurrences, TP embeds the acting/victim player
  and team directly on each event, so no correlation step is needed. Runs
  last: it needs `match_teams` (populated by team participation, above), the
  players step's `playerIdsByLineUpId`/`starPlayerIdsByRosterAndMaster`
  maps, and `matchIdsByTpId` (from matches import) to resolve each event's
  match. Idempotent; a roster id or `lineUpId` that can't be resolved is
  recorded as a non-fatal error and the event is still emitted with that
  field omitted.
- **TpMatchOutcomesImportService** — runs last of every match-related step
  (after match events, since it counts scores from the `touchdown` events they
  import): per competition, it sends `matches.resolveOutcomes` a tie-break for
  every match with a `winner` — TP's own per-match field, independent of
  score, so no bracket reconstruction like BBL's trophy-table placements is
  needed. `'home'`/`'away'` resolve the corresponding roster id to a team era
  (via `teamErasByRosterId` and the competition's `eraId`); `'draw'` sends an
  explicit `null` winner; a match with no `winner` sends no tie-break at all.
  TP has no result-override config, unlike BBL — `overrides` is always empty.
  Every match the server cannot settle is reported as an import error naming
  its TP match id.

`main.ts` orchestrates these in dependency order — league, then rule sets,
then eras, then competitions, then matches (fed the competitions step's
`matchesByCompetitionId`), then coaches, then races, then teams, then
positions, then players (including hired star players), then star position
race/era availability, then team participation, then match events, and
finally match outcomes — aggregating each step's `ImportResult` into one
overall result, mirroring `tools/import-bbl/src/main.ts`.
Races, teams, and positions run after coaches; they have no FK dependency on the
earlier import steps (only on each other, in that order). Players run after
positions and teams (each player resolves a team era and a position). Star
position race/era availability runs immediately after players, since it needs
the `starPositionUsages` that step emits. Team participation runs after that
because it needs the teams step's resolved team-era ids and the competitions
step's maps. Match events run after that because they depend on
`match_teams`, which team participation is what populates. Match outcomes run
last of all because they count scores from the touchdown events match events
just imported.

## Related documentation

- [file-format.md](./file-format.md) — working notes on the source JSON format.
