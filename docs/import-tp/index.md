# import-tp

`tools/import-tp/` imports data from TP into the tracker. The source data is
a set of JSON API responses, laid out as one subdirectory per era, with a
per-competition subdirectory inside each era (e.g.
`data/fourth-era/tloegbbl-chaos-cup-8/`). Unlike BBL's HTML mirror, TP's
files are JSON.

## Configuration

Configuration is supplied through a JSON5 file, `import-tp-config.json5`, in the
tool directory (`tools/import-tp/`). JSON5 allows comments and trailing commas,
so the era list can be documented inline.

Running the tool with the environment variable `IMPORT_CONFIG_ENV=production`
makes it read `import-tp-config.production.json5` from the same directory
instead. Both files have exactly the same shape and the same committed
template (`import-tp-config.example.json5`); they differ only in the values
they carry, so a production run can point at the production api-server
without disturbing the local-development config. Both are git-ignored.

Top-level keys:

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

```text
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

   ```text
   Imported 5 record(s) successfully.
   ```

   On failure, the tool exits with a non-zero status and prints each error.

3. To import into the production api-server instead, keep a second config file
   `tools/import-tp/import-tp-config.production.json5` (copied from the same
   example template, with `apiBaseUrl` changed to `http://localhost:3001`),
   run `flyctl proxy 3001:3000` from the repository root in another
   terminal, and set `IMPORT_CONFIG_ENV=production` for the run. See
   [Running import tools against production](../discord-bot/production-imports.md).

## Architecture

Teams, players and matches are imported server-side: `TpRosterFilesImportService` sends each roster file's raw content to the `tpRosters.import` procedure, and `TpMatchFilesImportService` sends each match file's raw content to `tpMatches.import`, both implemented by `packages/import-tp-live` (see [docs/import-tp-live/index.md](../import-tp-live/index.md)). The tool never parses a roster or a match for those upserts; it does parse rosters and matches for team/competition participation and for the skills and career SPP counts later steps need.

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
  consistency within each era's data directory, using
  `TournamentParserService.parse()` from `packages/parse-tp`.
- **TpCompetitionsImportService** — upserts each competition found under the
  era directories. A competition is one `<era>/<competition>` subdirectory: its
  base `tournament_<slug>.json` gives the name and TP id, its `match_*.json`
  files give the dates whose span classifies it (span ≤ 3 days ⇒ cup, else
  season) and whose earliest/latest values become its `startDate`/`endDate`
  (`YYYY-MM-DD`), and its era is the directory's own era (looked up in the
  `eraIdsByName` map from `TpErasImportService`, with no date-range matching —
  unlike BBL). Uses `MatchParserService` and `TournamentParserService` from
  `packages/parse-tp`, and `MatchDateRangeService` from `packages/import` for
  the earliest/latest/span computation (shared with BBL's importer). Each
  competition carries a TP external id (the stringified tournament id).
  Competitions missing a base tournament file, with an unparsable one, with
  no dated matches, or whose era has no known id are skipped with a recorded
  error.
- **TpCoachesImportService** — upserts every coach registered to a competition,
  read from each competition's `inscriptions_<slug>_inscriptions.json` file via
  `InscriptionsParserService` from `packages/parse-tp`. Coaches are deduped
  globally by TP's stable `player.id` and keyed under three external systems:
  TP (canonical, by `player.id`), Name (by the coach's name), and NAF (by the
  coach's NAF number — only when present). Returns a `coachIdsByTpId` map that a
  later team-import sub-issue will use to resolve each team's coach; unused here.
- **TpRacesImportService** — upserts each race from TP's official team list
  (read via `OfficialTeamsCollectionService`, not from played rosters),
  grouped by the list's own display name so rule-set-variant codes merge onto
  one row. Each upsert carries every distinct code as a TP external id (all in
  one call for merge semantics), the display name as a Name external id, and
  every configured era declaring any rules set the race appears on — resolved
  from era config (`league.eras[].identity.rulesSets`), not from which
  rosters happened to use the race in which era. Returns `raceNamesById` (DB
  race id -> display name), consumed by the positions import to build a Name
  external id; downstream consumers otherwise resolve a race server-side by
  its `teamRaceCode`.
- **TpRosterFilesImportService** — calls `tpRosters.import` once per
  distinct (era, roster id), since a roster file appears under every
  competition its team played in. Each call sends the file's raw content,
  its era (from the directory it was found in), the configured external
  system name, and the roster's match-snapshot-only players. The server
  upserts the team (keyed by roster id + name, race and coach resolved by
  TP external id, skipped with an error when either is missing) and its
  players. A team seen under several eras is sent once per era; the
  server's era sync only ever adds, so its eras accumulate. Returns
  `teamErasByRosterId`, `playerIdsByLineUpId`, `insertedPlayerIds` and
  `mercenaryPositionUsages` for the later steps.
- **TpPositionsImportService** — upserts each position from TP's official
  team list (read via `OfficialTeamsCollectionService`, not from played
  rosters), grouped by `(raceId, name)` — one unified path for regular and
  star positions alike, distinguished only by `isStarPlayer`. Because
  `TpRacesImportService` already merges a race's rules-set-variant codes onto
  one row, the same position seen under different variant codes collapses
  into the same group. Each group's TP external ids are its official-list
  `tpPositionId`s (one upsert call for merge semantics); a star's Name
  external id is its bare name (matching the convention the hired-star-player
  path below already uses, so both paths dedupe onto the same `Position`
  row), while a regular position's Name external id is race-scoped
  (`${raceName}: ${positionName}`, since position names aren't globally
  unique). After each upsert, `syncRaceEras` records which of the group's eras
  the position was seen under — for star positions too, since the official
  list states directly which race may field which star under which rules set,
  so their availability comes straight from that, not from observed hires.
  Each group
  also carries the characteristics the official list reports per `(position,
rules set)` (see
  [file-format-official-teams.md](./file-format-official-teams.md)),
  resolving each era's rules set via `TpEraRulesSetResolverService`. That does
  need conflict resolution: an official roster (`teamRosterType === 0`) and a
  legacy one (`1`) of the same race can both carry the same `(position, rules
set)` with different stats — three BB2020 positions really do (Norse Yhetee,
  Vampire Thrall Lineman, Vampire Blitzer) — so
  `recordCharacteristicsForRulesSet` tags each recorded value with the roster
  kind it came from and lets the official value win regardless of which roster
  is processed first. A slot only a legacy roster carries keeps its legacy
  value, which is strictly better than dropping the position. Returns
  `characteristicsByPositionId` (positionId -> rulesSetId ->
  characteristics), consumed by `TpPositionCharacteristicsImportService`
  below.
- **TpPositionCharacteristicsImportService** — writes each position's
  accumulated `characteristicsByPositionId` entries into
  `position_rules_sets` via the shared `PositionRulesSetsImportService`, one
  sync call per position so one bad position's characteristics don't reject
  every other position's. Because a position's batch spans every rules set it
  was accumulated under, a future rules set with no Passing characteristic
  would have its whole position's batch rejected by server-side validation —
  not an issue today, since every rules set TP currently covers (BB2020,
  DB2021, BB2025) has Passing. Runs right after positions import.
- **Player import (server-side, `TpRosterPlayersImportService` in `packages/import-tp-live`)** —
  imports every roster player instance from `lineUps[]`, in the same `tpRosters.import` call that
  upserts the team (`teamErasByRosterId` above is this call's own return value, not an input to
  it): each player's team era is the `teamEraId` that call's own team upsert just returned, and
  its position comes from `TpPlayerPositionService.resolveCatalogPositions` (one batched
  `positions.resolveBatch` call per roster, over every distinct `lineUpMasterId` on it); if that
  fails but the player is a mercenary Big Guy (`isBigGuy: true`, e.g. "Giant" — no catalog entry
  in either `rosterMaster` array at all), it falls back to a reused `isStarPlayer: true` Position
  keyed by the player's own inline `fallbackPositionName`, the same treatment a star player gets.
  A player whose team era or position (even via that fallback) can't be resolved is recorded as
  an error and skipped. Because TP supplies no characteristics for a mercenary anywhere — the
  name is in no roster catalog, and the match-embedded `lineUps[]` entry for a hire carries no
  `ma/st/ag/pa/av` — each hire's characteristics come from the curated `position_rules_sets` row
  `tools/import-manual` writes in its before-other-importers phase
  (`data/before-other-importers/position-characteristics-gap-fill.json5`).
  `TpMercenaryCharacteristicsService` reads that row from the database, once per distinct
  mercenary name per roster import, and caches it by rules set id for the run's hires. It keeps
  no copy of the values itself: two copies of the same numbers could drift, and reading the real
  row removes that risk. The per-hire fallback runs only when the hire embedded no
  characteristics of its own, so a future TP payload that does supply them still wins. A
  mercenary position with no curated row at all, or a hire under a rules set no row covers, is
  recorded as an `ImportError` rather than silently leaving the characteristics unset. Players
  carry only a TP external id (no Name external id — player names aren't unique). Returns
  `playerIdsByLineUpId`, consumed by match-event import to resolve a `matchEvents[].lineUpId`.
  Also consumes `matchEmbeddedPlayersByRosterId`
  from `main.ts`'s pre-scan of `matchesByCompetitionId` (each match's
  `homeRosterPlayers`/`awayRosterPlayers` — a per-match roster snapshot
  parsed by `MatchParserService`, grouped by roster id): for each roster it
  merges these match-embedded players with `roster.players`, keyed by
  player id, so a player who has since left/been replaced on the roster
  (absent from the standalone `rosters_<id>.json` file) is still imported,
  with `roster.players`' own data winning on conflict for a given id — see
  [file-format-rosters.md](./file-format-rosters.md)
  for why.

  A roster player's current lasting injuries come from three places.
  `nigglingInjuries` and `canPlayNextGame` are stated directly in the
  `lineUps[]` entry. TP says nothing at all about a currently-reduced
  characteristic, so those are derived by comparing the player's own
  `ma/st/ag/pa/av` against the `lineUpMaster` template they were recruited
  from: advancement only ever moves a characteristic toward better, so any
  current value on the worse side of the template is an active, unhealed
  reduction, and the gap is how many reductions deep it is. Which side is
  "worse" depends on the rules set's declared format for that specific
  characteristic — under a target-number format Agility and Passing are targets
  the player rolls, so a lower number is better, while Armour is a target the
  opponent rolls, so a higher number is better — which is why the import
  reads the era's rules set, with its formats, from the database. One
  player can legitimately show an advancement on one characteristic and an
  injury on another at the same time.

  A star player hired mid-season through an `inducements_roll` event has no
  `lineUps[]` entry, so TP publishes no live state for them: no lasting-injury
  values are sent, leaving the row's defaults.

  A roster player's `lineUpMaster.skills` are their starting skills; their own
  `skills` are the ones gained via advancement, mapped to `random`/`chosen` via
  TP's `isRandom` flag, with `advancementOrder` set to each skill's 1-based
  index in that array. A match-embedded-only (departed) player gets no skills
  at all: their only surviving data is the flat bare-id list described above,
  with no starting/gained split, no `isRandom`, and no attribute values.
  Characteristic-increase counts are derived the same way BBL's are: diffing
  converted characteristics against the position's stored values under the
  era's rules set, adding back outstanding reductions.

- **TpInducedStarPlayersStepService** — imports every star player hired via
  an `inducements_roll` match event (gathered by `main.ts` from the
  already-parsed match events): each gets a reused `isStarPlayer: true`
  Position and a Player scoped to the hiring roster's team-era, with the
  star position's template characteristics for the hiring era's rules set.
  Returns `starPlayerIdsByRosterAndMaster`, keyed
  `` `${rosterId}:${lineUpMasterId}` `` (currently unconsumed downstream — no
  match-event type references a player by `lineUpMasterId` yet). Star
  position race/era availability is not derived from any of this: TP's
  official team list already states directly which race may field which star
  under which rules set, so `TpPositionsImportService`'s `syncRaceEras` calls
  (above) cover star positions the same way they cover regular ones — this
  step needs no equivalent bookkeeping of its own.
- **TpRosterPlayerFactsService** — reads each imported roster player's
  skills and career SPP counts off the parsed roster files, keyed by DB
  player id, for the player-skills sync and SPP adjustments.
- **TpMercenaryPositionRaceErasImportService** — writes `positions_race_eras`
  for mercenary Big Guy positions, which no official-list catalog carries, so
  their race/era availability is the one kind still derived from observed
  usage: the `mercenaryPositionUsages` the players step emits (one per
  imported mercenary hire). Resolves each usage's `(teamRaceCode, era)` to
  `(raceId, eraId)`, dedupes the pairs per position, and writes them with one
  upsert-only `syncRaceEras` call per position. Runs right after players,
  since the usages only exist once players are imported; an unresolvable race
  code or era name is recorded as an error and skipped.
- **TpTeamParticipationImportService** — populates `competition_teams` for the
  already-imported competitions: every registered team, including one that
  never played a match. Runs after teams import (it needs each team's
  resolved team-era ids) and consumes only maps the earlier steps produced
  plus the shared `rosters` list — no new file scanning. For each competition
  it resolves the roster ids of the roster files under its own directory to
  team-era ids and re-upserts the competition with those `teamEraIds`. A
  match's own teams (`match_teams`) are linked by `tpMatches.import` instead,
  below — unlike BBL, TP needs no page scraping for that because it embeds
  both teams' roster ids per match.
- **TpAwardsReaderService** — walks every competition directory's `awards_*.json`
  file via `AwardsParserService` from `packages/parse-tp`, returning the parsed
  awards keyed by `${era}::${competition}` (the same directory key
  `TpCompetitionsImportService` groups its competitions by). A directory with no
  awards file is simply absent from the map (normal for an unfinished
  competition); a malformed file records an error and costs only that
  competition's awards. Two files in the same directory accumulate rather than
  overwrite.
- **TpTrophyAwardsImportService** — records every team award from TP's
  per-competition awards files: the 1st/2nd/3rd placements and, where present,
  Best Stunty and Wooden Spoon. A trophy is _resolved, never created_: the
  upsert carries only the award's lookup key
  (`` `${disambiguator}-${groupName}` ``, where the disambiguator is the
  award's own `name` when present and its numeric `awardType` otherwise) as a
  `tourplay.net` external id against the curated trophy catalog seeded by
  tools/import-manual. The competition's curated group comes from its own
  `competitionGroupId` (set by tools/import-manual's before-other-importers
  phase); the winning team's team era is resolved via `teamErasByRosterId` and
  the competition's own era. TP records team awards only, so no player data is
  needed. An unresolvable competition, group, trophy key, or team era is
  recorded as an error and skipped; resolutions (successes and failures) are
  memoized per run, and further rows against an already-known-bad key are
  summarized in one error at the end.
- **TpMatchFilesImportService** — streams every `match_*.json` again and
  sends each raw to `tpMatches.import` with its competition's TP id and
  bracket; see
  [import-tp-live's match import](../import-tp-live/match-import.md) for what
  the server does with it (upserting the match, linking its teams, importing
  its events — see
  [file-format-match.md](./file-format-match.md) for the full decode table —
  and resolving its outcome). Runs after team participation and trophy
  awards, since it needs both teams' team eras resolvable. Files are streamed
  again rather than kept from the competitions scan, so only one raw match is
  held in memory at a time; a file under a competition that was not imported,
  or that did not parse during the competitions scan, is skipped.
- **TpSppAdjustmentsImportService** — reconciles `players.spp_adjustment` for
  every imported player. Unlike BBL, TP's own career SPP total is already
  trusted and stored as `players.spp_total` by the players step, so this step
  only measures the gap between that total and what the player's imported
  events explain — it never rewrites `spp_total`. Because TP's total is
  career-wide and can include competitions not yet downloaded, each player's
  TP-reported career action counts are sent along so the server can price and
  discount those not-yet-imported events instead of misattributing them as
  unexplained adjustment. Runs after match-file import, since it depends on
  `match_events.spp_value` already being populated.

### Lasting-injury history backfill

A final step, after match-file import, for the players this run inserted.
A current-state-only write records only what is outstanding now, so an injury
already healed before the first import that captured live state would leave no
trace anywhere. For each freshly-inserted player the server recomputes what
their imported match events say they have accumulated — niggling injuries and
stat reductions, deliberately not miss-next-game, which clears after one game
and would otherwise flag nearly every player who has ever been hurt — and,
when the current row is clean and the accumulated state is nonzero, writes
the accumulated values and immediately writes the real ones back, producing
the two history versions
`tools/review-player`'s "healed" stratum needs.

It must run after match events for a structural reason: `match_events` rows
foreign-key into `players.id`, so players are necessarily imported first, and
the accumulated data does not exist yet at player-insert time. It is scoped to
inserted players so an existing one does not collect a spurious history
version pair on every import. Correctness is guaranteed from the next full
database drop and re-import onward; no attempt is made to retroactively repair
a database carrying lasting-injury columns from a partial rollout.

`main.ts` orchestrates these in dependency order — league, then rule sets, then eras, then
competitions (producing `matchesByCompetitionId`, consumed later by the match-file import below),
then coaches, then the roster files and TP's official team list, each scanned and parsed once
client-side for the bulk tool's own local steps below (the roster import call re-sends each
file's raw content, which `TpRosterImportService.importRawRoster` parses a second time,
server-side), then races, then positions, then position characteristics, then the keyword catalog
and position keywords, then starting skills, then roster import — teams and players together, one
`tpRosters.import` call per distinct era/roster pair (a roster id in more than one era is sent
once per era; see [import-tp-live's architecture](../import-tp-live/index.md#what-it-owns)) —
then induced star hires, then roster player facts (skills and career SPP counts), then player
skills sync, then mercenary position/race/era sync, then team participation, then trophy awards,
then match files (one `tpMatches.import` call per file, importing the match, its teams, its
events and its outcome together — see
[import-tp-live's match import](../import-tp-live/match-import.md)), then SPP adjustments, then
the lasting-injury backfill, and finally missing trophy awards — aggregating each step's
`ImportResult` into one overall result, mirroring `tools/import-bbl/src/main.ts`.
Races and positions run after coaches; they have no FK dependency on the earlier import steps
(only on each other, in that order). Roster import runs after positions and skills (each player
resolves a team era and a position, needing the starting-skills catalog already loaded). Team
participation runs after that because it needs the roster import's resolved team-era ids and the
competitions step's maps. Trophy awards run after team participation, resolving each award's
competition, curated group, and winning team's team era. Match files run after that because
resolving a match's context needs both teams' team eras already resolvable, the same requirement
team participation exists to satisfy. SPP adjustments run last of the match-related steps because
they depend on `match_events.spp_value`, which match-file import is what populates.

### Reference resolution

Where an import step needs the database id of an entity it does not create
itself — an era's league and rules sets, a competition's era, a team's race
and coach, a position's race, a player's position, a competition id — it
asks the API to resolve that entity's external id (see
[RPC conventions](../api/rpc-conventions.md#reference-resolution)) rather
than consulting a map built earlier in the same run. Each step resolves
everything it needs in one batched call and then looks the records up locally,
so the network cost is one round trip per step, not per record.

The ordering in `main.ts` matters — a race has to be upserted before a team
referencing it can be resolved — but resolution itself reads the database,
not a client-side id map built earlier in the same run.

Some maps deliberately remain, because no external-id resolve can answer
them: the competition payload carrier `competitionsByTpId` and the map
`TpCompetitionIdResolverService` derives from it (`eraIdByCompetitionId`,
keyed by the already-resolved database competition id — not a client-side
substitute for resolution, just its readily available byproduct), parsed
match data, a race's display name (`raceNamesById`), `team_eras` rows (which
have no external ids of their own), classification and evidence sets, and
matches and players (which have no resolve procedure).

### Position keywords

Each position and star player in TP's official team list carries its numeric
keyword codes spread over three fields: the `race` array (species codes), the
`positionTypes` bitmask (positional codes) and the `isBigGuy` boolean, merged
into one array (parsed as `TpOfficialPosition.keywordCodes`). `race` is
non-empty only under BB2025 — species keywords are a BB2025-only concept. The
other two fields are decoded unconditionally, for any rules set that carries
them: DB2021 publishes the full `positionTypes` set, and both BB2020 and
DB2021 publish `isBigGuy` (Trolls, Minotaurs, and similar Big Guys), so an
earlier-rules-set entry can still end up with real positional keyword codes,
including Big Guy. `TpKeywordCatalogService` reads the curated keyword catalogue once per run
(via `KeywordsImportService.listKeywords`), keyed by each keyword's
`tourplay.net` external id, and
`TpPositionKeywordsImportService` resolves every position's codes against it
and syncs the resulting `(position, rules set, keyword)` rows. A code with no
curated match is reported once as an import error, naming the position it was
first seen on and pointing at
`tools/import-manual/data/before-other-importers/keywords.json5`; the
position's other keywords are still written. The same catalogue also decodes a
`Hatred`/`Animosity` skill's own type-3 target code — see
[Keyword target decoding](./keyword-target-decoding.md).

## Related documentation

- [import-tp-live](../import-tp-live/index.md) — the server-side team/player import behind `tpRosters.import` and the live team import, and the server-side match import behind `tpMatches.import` and the live match import (see its [match-import.md](../import-tp-live/match-import.md)).
- [file-format.md](./file-format.md) — working notes on the source JSON format.
- [keyword-target-decoding.md](./keyword-target-decoding.md) — type-3
  `Hatred`/`Animosity` skill-attribute decoding and skillMasterId curation.
