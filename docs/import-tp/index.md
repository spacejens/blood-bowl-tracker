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
- **TpTeamsImportService** — upserts each team (keyed by roster id + name),
  resolving race via `raceIdsByCode` and coach via `coachIdsByTpId`;
  skips any team whose race or coach cannot be resolved. Teams are grouped by
  id so one seen under multiple eras unions its eras.
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
- **TpPlayersImportService** — imports every roster player instance from
  `lineUps[]`: each resolves a team era (roster id + era, via
  `teamErasByRosterId`) and a position (`lineUpMasterId`, via
  `positionIdsByExternalId`); if that fails but the player is a mercenary
  Big Guy (`isBigGuy: true`, e.g. "Giant" — no catalog entry in either
  `rosterMaster` array at all), it falls back to a reused `isStarPlayer: true`
  Position keyed by the player's own inline `fallbackPositionName`, the same
  treatment a star player gets. A player whose team era or position (even via
  that fallback) can't be resolved is recorded as an error and skipped.
  Because TP supplies no characteristics for a mercenary anywhere — the name
  is in no roster catalog, and the match-embedded `lineUps[]` entry for a hire
  carries no `ma/st/ag/pa/av` — each hire's characteristics come from the
  curated `position_rules_sets` row `tools/import-manual` writes in its
  before-other-importers phase
  (`data/before-other-importers/position-characteristics-gap-fill.json5`).
  `TpMercenaryCharacteristicsService` reads that row over the
  `positionRulesSets.list` procedure, once per distinct mercenary name per
  import run, and caches it by rules set id for the run's hires. The tool
  keeps no copy of the values itself: two copies of the same numbers could
  drift, and reading the real row removes that risk. The per-hire fallback
  runs only when the hire embedded no characteristics of its own, so a future
  TP payload that does supply them still wins. A mercenary position with no
  curated row at all, or a hire under a rules set no row covers, is recorded
  as an `ImportError` rather than silently leaving the characteristics unset.
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
  [file-format-rosters.md](./file-format-rosters.md)
  for why. Also imports every star player hired via an `inducements_roll`
  match event (gathered by `main.ts` from the already-parsed match events,
  not from any roster field), each getting a reused `isStarPlayer: true`
  Position and a Player scoped to the hiring roster's team-era; returns
  `starPlayerIdsByRosterAndMaster`, keyed
  `` `${rosterId}:${lineUpMasterId}` `` (currently unconsumed downstream — no
  match-event type references a player by `lineUpMasterId` yet). Star
  position race/era availability is not derived from any of this: TP's
  official team list already states directly which race may field which star
  under which rules set, so `TpPositionsImportService`'s `syncRaceEras` calls
  (above) cover star positions the same way they cover regular ones — this
  step needs no equivalent bookkeeping of its own.

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
  opponent rolls, so a higher number is better — which is why the rules-sets
  step's own upsert responses are threaded through to the players step. One
  player can legitimately show an advancement on one characteristic and an
  injury on another at the same time.

  A star player hired mid-season through an `inducements_roll` event has no
  `lineUps[]` entry, so TP publishes no live state for them: no lasting-injury
  values are sent, leaving the row's defaults.
- **TpMercenaryPositionRaceErasImportService** — writes `positions_race_eras`
  for mercenary Big Guy positions, which no official-list catalog carries, so
  their race/era availability is the one kind still derived from observed
  usage: the `mercenaryPositionUsages` the players step emits (one per
  imported mercenary hire). Resolves each usage's `(teamRaceCode, era)` to
  `(raceId, eraId)`, dedupes the pairs per position, and writes them with one
  upsert-only `syncRaceEras` call per position. Runs right after players,
  since the usages only exist once players are imported; an unresolvable race
  code or era name is recorded as an error and skipped.
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
- **TpMatchEventsImportService** — imports touchdown, injury/casualty, and
  administrative match events from every already-parsed TP match's
  `matchEvents[]` (see
  [file-format-match.md](./file-format-match.md)
  for the full decode table). Unlike BBL, which correlates separately
  scraped action/consequence occurrences, TP embeds the acting/victim player
  and team directly on each event, so no correlation step is needed. Runs
  after the team-participation and players steps: it needs `match_teams`
  (populated by team participation, above), the players step's
  `playerIdsByLineUpId`/`starPlayerIdsByRosterAndMaster` maps, and
  `matchIdsByTpId` (from matches import) to resolve each event's match.
  Idempotent; a roster id or `lineUpId` that can't be resolved is recorded as
  a non-fatal error and the event is still emitted with that field omitted.
- **TpSppAdjustmentsImportService** — reconciles `players.spp_adjustment` for
  every imported player. Unlike BBL, TP's own career SPP total is already
  trusted and stored as `players.spp_total` by the players step, so this step
  only measures the gap between that total and what the player's imported
  events explain — it never rewrites `spp_total`. Because TP's total is
  career-wide and can include competitions not yet downloaded, each player's
  TP-reported career action counts are sent along so the server can price and
  discount those not-yet-imported events instead of misattributing them as
  unexplained adjustment. Runs after match events, since it depends on
  `match_events.spp_value` already being populated.
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

### Lasting-injury history backfill

A final step, after the match-events step, for the players this run inserted.
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

`main.ts` orchestrates these in dependency order — league, then rule sets,
then eras, then competitions, then matches (fed the competitions step's
`matchesByCompetitionId`), then coaches, then races, then teams, then
positions, then players (including hired star players), then team
participation, then trophy awards, then match events, and finally match
outcomes — aggregating each step's `ImportResult` into one overall result,
mirroring `tools/import-bbl/src/main.ts`.
Races, teams, and positions run after coaches; they have no FK dependency on the
earlier import steps (only on each other, in that order). Players run after
positions and teams (each player resolves a team era and a position). Team
participation runs after that because it needs the teams step's resolved
team-era ids and the competitions step's maps. Trophy awards run after team
participation, resolving each award's competition, curated group, and
winning team's team era. Match events run after that because they depend on
`match_teams`, which team participation is what populates. Match outcomes
run last of all because they count scores from the touchdown events match
events just imported.

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
them: the competition payload carrier `competitionsByTpId` and the two maps
`TpCompetitionIdResolverService` derives from it
(`competitionTypesByCompetitionId` and `eraIdByCompetitionId`, both keyed by
the already-resolved database competition id — not client-side substitutes
for resolution, just its readily available byproducts), parsed match data, a
race's display name (`raceNamesById`), `team_eras` rows (which have no
external ids of their own), classification and evidence sets, and matches and
players (which have no resolve procedure).

### Hard-coded TP lookups

TP publishes a starting skill's parenthetical value as a `skillAttributeMaster`
with a `type`. Types 0–2 are directly displayable; **type 3 is an opaque
numeric code** into a TP-internal lookup this project does not have, so a
type-3 reference is normally dropped with a recorded import error rather than
composed as-is. Two exceptions are hard-coded, each scoped to its own
skillMasterId so a code confirmed for one skill can never mislabel another's:
`Hatred` (skillMasterId 307) via `HatredTargetService`
(`packages/parse-tp/src/hatred-target.service.ts`) — `100` Dwarf, `102` Troll,
`108` Vampire, `110` Undead, `134` Big Guy, `1001` Daemon — and `Animosity`
(skillMasterId 269) via `AnimosityTargetService`
(`packages/parse-tp/src/animosity-target.service.ts`) — `111` Goblin, `999`
All. A code in the matching table composes normally (`Hatred (Undead)`);
every other type-3 code, or one for a different skillMasterId, keeps the
unchanged drop-and-report behaviour.

Every `skillMasterId` the scan CAN name is registered as a `tourplay.net`
external id on the skill it names, at ordinary upsert time — exactly as
`TpPositionsImportService` registers every TP position id on one position row.
No curation is needed for those.

A handful of `skillMasterId`s carry no name in any downloaded mirror file at
all, so the scan can never learn them however much history is downloaded.
These are **not** hard-coded: each is curated as a `tourplay.net` external id
on the skill it means, in
`tools/import-manual/data/before-other-importers/skills.json5`, and
`TpPositionSkillsImportService` resolves it through the ordinary external-id
mechanism. Most belong to a skill already known under a different id (TP
assigns a new id to the same skill per rules set), except `Punt` and
`Fumblerooski`, genuinely new to the curated catalogue.

Both type-3 tables are deliberate, hard-coded, id-specific exceptions, not
general decoders. If TP's own lookup or position-keyword data is ever imported
directly, that import should **replace** them rather than sit alongside them.

## Related documentation

- [file-format.md](./file-format.md) — working notes on the source JSON format.
