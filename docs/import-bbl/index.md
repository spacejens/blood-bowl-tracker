# import-bbl

`tools/import-bbl/` imports data from the BBL league website into the tracker
via the API. The source data is a `wget` mirror: a folder of HTML pages named
`default.asp?p=<type>&<params>`, encoded ISO-8859-1.

## Configuration

Configuration is supplied through a JSON5 file in the tool directory
(`tools/import-bbl/`): `import-bbl-config.json5` by default, or
`import-bbl-config.production.json5` when the tool is run with the
environment variable `IMPORT_CONFIG_ENV=production`. Both files have exactly
the same shape and the same committed template
(`import-bbl-config.example.json5`); they differ only in the values they
carry, so a production run can point at the production api-server without
disturbing the local-development config. JSON5 allows comments and multi-line
structured values, so the era and match-merge lists can be documented and
formatted inline. The file is the sole configuration source. Top-level keys are
camelCase, grouped into nested objects by concern. BBL records are registered
under the `tloeg.bbleague.se` external system (`BBL_EXTERNAL_SYSTEM_NAME` in
`packages/domain-enums`); the name is not configurable.

- `dataDir` — path to the folder that directly contains the
  `default.asp?p=...` files. This is a subfolder of the git-ignored `data/`
  directory (each `wget` download lands in its own subfolder). A relative path
  resolves against the current working directory. Ask the developer for the
  download if you don't have it.
- `connection` — runtime settings for reaching the api-server to import into.
  The group itself is required.
  - `apiBaseUrl` — base URL of the running api-server to import into. Defaults
    to `http://localhost:3000` (a local docker-compose deployment) if unset.
  - `apiToken` — **required.** The bearer token this tool authenticates with;
    the api-server rejects unauthenticated requests with `401`. Must match the
    `API_TOKEN_IMPORT_BBL` value in `apps/discord-bot/.env` (see
    [RPC conventions](../api/rpc-conventions.md)) — or, in
    `import-bbl-config.production.json5`, the `API_TOKEN_IMPORT_BBL` value in
    `apps/discord-bot/.env.production`. Treat it like a password — both
    `import-bbl-config.json5` and `import-bbl-config.production.json5` are
    git-ignored, so they are never committed.
- `leagues` — an array of the leagues the BBL data covers. Each entry has a
  `name` and an `eras` array. The BBL data mirror covers a single league
  whose name is not present in the data, so league names are supplied here. Each
  league name is used as that league's external ID under both the
  `tloeg.bbleague.se` and `Name` external systems. Rules sets and eras are not present in the source
  data, so they are supplied here. **Nota bene: era names must be unique across
  all leagues**, since they feed a single flat era map downstream.
  - `name` — the name of a league the BBL data covers.
  - `eras` — a JSON array describing the eras a league played through. Each
    entry is grouped into six parts:
    - `identity` — `name` and `rulesSets` (a non-empty array of the rules set
      names the era spans, in chronological order — most eras list a single
      rules set, but an era can span several, e.g.
      `["CRP", "CRP+", "BB2016"]`).
    - `dates` — `startDate` (required, ISO `YYYY-MM-DD`), `endDate` (optional
      — omit for an era still ongoing), and `autoAssignByDate` (required
      boolean). When `autoAssignByDate` is `false`, the era is excluded from
      the automatic match-date → era resolution scan (its `startDate`/
      `endDate` are still imported); the era is then only ever reached through
      its competition override lists.
    - `players` — `firstPlayerId` (required, positive integer, only when
      `autoAssignByPlayerId` is `true`; optional otherwise), `lastPlayerId`
      (optional, following the same still-ongoing rule as `endDate` — when
      `lastPlayerId` is omitted, the era matches any pid `>= firstPlayerId`
      with no upper bound), `autoAssignByPlayerId` (required boolean), and
      `playerIdOverrides` (an optional array of pids explicitly assigned to
      this era, checked before the range bounds — BBL player ids are only
      roughly chronological, so a handful of players drafted right at an era
      changeover can land on the "wrong" side of a range split; overrides
      correct those known exceptions without widening the range). When
      `autoAssignByPlayerId` is `false`, the era is excluded from the
      pid-range fallback scan; the era is then only ever reached through
      `teamCodeOverrides`/`playerIdOverrides`.
    - `competitions` (optional) — `overrides`, an optional array of
      `{ bblId, type, startDate?, endDate? }` objects, each hard-assigning
      one competition bblId to this era and forcing its `type` (`season` or
      `cup`), regardless of match dates — used for a competition with an
      empty match list, or one whose date-span would otherwise misclassify
      its type. `startDate`/`endDate` are only consulted when that
      competition has no dated matches at all to derive them from (one that
      does have matches always uses those instead); `startDate` is then
      required, since every imported competition needs one — a match-less
      override with no `startDate` is skipped with a recorded import error.
    - `teams` (optional) — `teamCodeOverrides`, an optional array of team
      codes whose players are pinned to this era regardless of pid, for
      side-competition eras (Stunty Leeg, Dungeon Bowl) that share the
      concurrent regular era's pid range.
    - `matches` (optional) — `merges`, an optional JSON array of `[id, id]`
      BBL match-id pairs to merge into a single match, e.g.
      `[["1061","1062"],["1311","1312"]]`. BBL's match model only supports two
      teams, so the special four-team "Bierhallentodball" finals
      (Ogretoberfest cups) were each registered as two separate two-team match
      rows. Each configured pair is imported as one match carrying both source
      matches' external ids, all four teams, and every event from both rows
      (with casualty actions correlated to their Sustained-Injury consequences
      across both source matches, not just within each). Both ids of a pair
      must appear in the same competition's match list; a pair that does not
      resolve is left unmerged and recorded as an error, with both ids
      imported as ordinary matches. Unset or empty means no merges are
      configured for that era (the common case). The
      `import-bbl-config.example.json5` ships this league's six confirmed
      pairs, all under `First era`, as a working example. `matches` also
      carries an optional `categoryOverrides` list, an array of
      `{ matchId, category }` entries, e.g.
      `[{ matchId: "1061", category: "cup_final" }]`. This lets the developer
      explicitly assign a match category for a BBL match id the keyword
      classifier cannot recognize (a thematic cup-final name such as
      "Bierhallentodball"/"Bierhallentotball") or deliberately refuses to
      guess at (an ambiguous stage-like name). A configured override always
      wins over the keyword classifier's guess. A match whose name the
      classifier cannot recognize, and which has no override here, fails the
      import until it gets either a keyword the classifier understands or an
      entry in this list. `merges` is optional within `matches` too, so an
      era may configure only `categoryOverrides` with no merges.

      `matches` also carries an optional `resultOverrides` list, an array of
      `{ matchId, winnerTeamCode }` entries, e.g.
      `[{ matchId: "1061", winnerTeamCode: "sew" }]`. `winnerTeamCode` is
      either a BBL team code (that team won) or the literal `"draw"`. This
      lets the developer settle a match whose winner cannot be derived from
      the touchdown count plus the competition's "Team trophy" placements —
      a tied knock-out match in a competition whose `sr` page carries no
      trophy table (e.g. Ogretoberfest 6), or a stage that normally forbids a
      draw but genuinely ended level because the competition was abandoned
      before its roll-off. A configured override always wins over the
      computed result. A match whose outcome cannot be determined, and which
      has no override here, is reported as an import error until it gets one.

    A competition bblId may appear in only one `competitions.overrides` entry,
    in only one era, across all eras; a team code in only one era's
    `teamCodeOverrides`;
    a match id in only one `matches.merges` pair across all eras; a match
    id in only one `matches.categoryOverrides` entry across all eras; and a
    match id in only one `matches.resultOverrides` entry across all eras. Rules
    sets and eras are not present in the source data, so they are supplied
    here. Each era's rules set names and each era name are used as external
    IDs under both the BBL external system (`tloeg.bbleague.se`) and the `Name`
    external system.

## Run it

1. Copy the template and fill in real values:

   ```bash
   cp tools/import-bbl/import-bbl-config.example.json5 tools/import-bbl/import-bbl-config.json5
   ```

   `tools/import-bbl/import-bbl-config.json5` is git-ignored, so your
   configuration is never committed.

2. Run the tool from the `tools/import-bbl/` directory so the config file is
   picked up automatically:

   ```bash
   pnpm --filter @blood-bowl-tracker/import-bbl run start
   ```

To import into the production api-server instead, keep a second config file
`tools/import-bbl/import-bbl-config.production.json5` (copied from the same
example template, with `apiBaseUrl` changed to `http://localhost:3001`), run
`flyctl proxy 3001:3000` from the repository root in another terminal, and
set `IMPORT_CONFIG_ENV=production` for the run. See
[Running import tools against production](../discord-bot/production-imports.md).

## Architecture

- **SourceModule** — reusable, data-type-agnostic core. `BblSourceReader`
  classifies files by page type (`p=` param) and streams pages one at a time
  (`pages(type)`), keeping memory bounded; listing the data folder and
  decoding ISO-8859-1 are delegated to `packages/read-bbl-mirror`, shared with
  the review tools. This is the pattern future data types reuse.
- **CoachesModule** — first data-type extractor. `CoachPageParser` reads a
  coach from a team page; `BblCoachesImportService` streams team pages,
  deduplicates coaches by exact name, and upserts each through the API.
- **RacesModule** — data-type extractor for races. `RacePageParser` reads a
  race's numeric BBL id and name from the race link on a team page, and
  `RaceListPageParser` reads every race's id and name off the `p=tl` master
  race-list page. `BblRacesImportService` streams team pages (independently of
  the coaches walk), deduplicates races by id and upserts each, then runs a
  second, gap-filling pass over the `tl` page: any race whose id was not already
  seen on the team-page pass is upserted the same way. The team-page pass is
  authoritative — on a shared id it wins — so races with no team page still
  import while `tm`-derived races are unaffected.
- **PositionsModule** — data-type extractor for positions. `PositionPageParser`
  reads a position's name, its "Can play for" races, whether it is a star
  player (the `None (star player)` marker), and its MA/ST/AG/PA/AV
  characteristics line from a `p=pt` page; `BblPositionsImportService` streams
  position pages and imports one row per (position, race) pair. Positions that
  list no race are reverse-engineered from player pages (`PlayerPageParser`,
  see PlayersModule): each of the position's players belongs to a team whose
  race is known, so the position's race(s) are recovered from
  `teamRaceIdsByCode`. `BblPositionRaceErasImportService` then rules on
  per-(position, race, era) availability, and
  `BblPositionCharacteristicsImportService` writes the scraped characteristics
  under the same rules sets. Both require positive evidence the position was
  played — an override, star-player status, or a recorded player use. An era
  in which the race fielded no teams at all is not evidence of availability
  and yields no row; genuine availability the source data cannot show is
  curated by hand in `tools/import-manual`. Runs after races and teams.
- **PlayersModule** — data-type extractor for players. `PlayerPageParser` reads
  a player's own `pid`, `<h1>` name, position (`p=pt&typID`) and team
  (`p=tm&t`) links, and MA/ST/AG/PA/AV characteristics line off a `p=pl` page.
  The positions import uses the position/team links to resolve the races of
  positions that list none; `BblPlayersImportService` streams player pages and
  imports one row per player, resolving its team era (via the team code and
  the era whose configured player-id range contains the pid) and position (via
  the composite `<typID>-<raceBblId>` key). Runs after teams, team eras, and
  positions (all referenced).

  The player page's "Sustained Injuries" field is parsed into the player's
  current lasting injuries: a comma-separated list of stat-reduction tags, an
  optional niggling-injury count, and a miss-next-game line. A tag suffixed
  "(no effect)" is not counted — it means the rules absorbed the reduction, so
  the stored characteristic never moved — and it is not read as a
  miss-next-game either, since BBL prints that line itself whenever one applies.
  The death marker is ignored here: death is not modelled as a lasting injury,
  but as the player's status (below). A page with no such row is read as an
  uninjured player, not a parse failure.

  The player page's Skills cell is read alongside the characteristics line. A
  plain entry is a starting skill; a coloured (green) entry is one gained via
  advancement, recorded under the `advancement` source since BBL records
  nothing about how it was gained. The closing SPP adjustment sync then
  records it as `chosen` or `random` when the page's reported spend allows
  only one (see [players](../game-concepts/players/index.md#unspent-spp)); a
  later import keeps that settled source rather than resetting it to
  `advancement`. A coloured entry holding only the red `?` marker is a
  pending, unresolved advancement roll, and is skipped silently.
  `advancementOrder` counts gained skills only, and is a presentation-order
  proxy, not a confirmed sequence. The same cell also carries five
  characteristic-increase pseudo-entries (`+MA`/`+ST`/`+AG`/`+PA`/`+AV`),
  rendered in the same gained colour as a real skill; each is excluded from
  the skill list (no `advancementOrder` slot consumed) and instead counted
  directly, one count per characteristic, sent with every player.

  The player's status comes from the icons inside the `<b>` of the page's
  player header (the name block under the portrait): the cross icon is
  `dead`, the retired icon is `retired`, the `retire.png` icon is
  `temporarily_retired`, and no icon is `active`. Precedence is dead, then
  retired, then temporarily retired. Icons elsewhere on the page belong to
  links to other players and are ignored. A page without the header block
  fails parsing like one without a name or team link, which also drops it
  from the positions step's pre-scan of player pages without a recorded error.
  A player on a retired team with no icon of their own is still `active`: the
  team's `retiredteam.gif` marker says nothing about the player.

  A final step after the match-events step backfills lasting-injury history for
  the players this run inserted. See "Lasting-injury history backfill" in
  [the TP importer's documentation](../import-tp/index.md), which describes the
  identical step.

- **TeamsModule** — data-type extractor for teams. `TeamPageParser` reads a
  team's page id and `<h1>` name from a team page; `BblTeamsImportService`
  streams team pages (independently of the coaches/races walks), deduplicates
  teams by page id, resolves each team's race and coach foreign keys through
  the API's `resolve` procedures (see
  [RPC conventions](../api/rpc-conventions.md#reference-resolution)), and
  upserts each through the API. Runs after races and coaches, since it depends
  on both.
- **MatchesModule** — data-type extractor for matches. `MatchListPageParser`
  reads each match's date and numeric BBL id (`m=<id>`, from the row's `onclick`
  link `default.asp?p=m&m=<id>`) off a competition's match-list page
  (`p=ma&so=s&s=<id>`). `MatchTeamsPageParser` reads a match's home and away team
  page ids (`t=<id>`) off its detail page (`p=m&m=<id>`); `BblMatchDetailReaderService`
  performs the single, memoized walk over `pages('m')` and returns each match's two
  team ids keyed by match BBL id, which the team-participation import consumes.
  `BblMatchListReaderService` performs the single, memoized walk over `pages('ma')`
  and returns the parsed `BblMatch[]` per competition; the competitions and
  team-participation imports both consume it instead of each walking the `ma` pages
  themselves. `BblMatchesImportService` upserts each completed match, keyed by its
  numeric BBL id under the competition's BBL external system (matches have no
  `Name` external id), with `competitionId` resolved to the imported competition's
  DB id. Runs after competitions, its only dependency; per-team results/scores
  and per-player events (`match_teams`/`match_events`) are populated by later
  steps, described below.
  `CompetitionTrophyPageParser` reads a competition's 1st/2nd/3rd-place team
  codes off the "Team trophy" table on its `sr` results page, if present;
  `BblCompetitionTrophyReaderService` performs the single, memoized walk over
  `pages('sr')` and returns the parsed placements per competition. Finally,
  `BblMatchOutcomesImportService` runs last of every match-related step (after
  match events, since it counts scores from the `touchdown` events they
  import): per competition, it sends `matches.resolveOutcomes` a configured
  `matches.resultOverrides` entry as an override (translating its BBL team
  code to a `team_era_id` via the team-participation import's
  `teamEraIdsByCompetitionBblId` map) and, for the competition's final and
  bronze matches, its trophy-table 1st/3rd-place team as a tie-break — the
  only matches a placement identifies the winner of. Every match the server
  cannot settle is reported as an import error naming its BBL id and pointing
  at `matches.resultOverrides`.
- **CompetitionsModule** — data-type extractor for competitions.
  `CompetitionListPageParser` reads every competition's numeric BBL id and name
  off the master dropdown embedded on any `se`/`sr` page (one page suffices).
  `BblCompetitionsImportService` reads that list, then reads each competition's
  matches (via `BblMatchListReaderService`) to derive its `type` (season vs
  cup, from the date span) and `eraId` (the era containing its earliest match
  date), and upserts each through the API. Runs after eras, whose
  `eraIdsByName` map it uses to resolve `eraId`.

- **TeamParticipationModule** — derives the team↔era, competition↔team, and
  race↔era links from real match participation (it reads each competition's
  standings page, one per competition, through `BblCompetitionStandingsReaderService` as well as the
  shared match readers; the standings page adds registered teams that played no
  matches). `BblTeamParticipationImportService` reads each
  competition's matches via the shared `BblMatchListReaderService` for grouping,
  resolves each match's two team ids from `BblMatchDetailReaderService`, and
  resolves those ids to imported teams via the teams import's `teamsByCode` map,
  syncs that team's era (`team_eras`), collects the resulting team-era ids onto
  the competition (`competition_teams`), and records each team's race against the
  era (`race_eras`). Runs after teams, races, and competitions (whose payload
  maps it re-upserts to attach the links). Team ids that don't match an imported
  team, matches with no detail page, and standings rows with no team code are
  recorded as errors and skipped.

- **MatchEventsModule** — `BblMatchEventsReaderService` reads each match's raw
  event occurrences; `MatchEventCorrelationService` correlates casualty
  actions with Sustained-Injury consequences and emits correlated events;
  `BblMatchEventsImportService` resolves each event's team codes to team-era
  ids and each player pid to its DB id, synthesizes a stable external id per
  event side, and upserts into `match_events` (requesting server-side SPP
  valuation on every event via `computeSppValue: true`, since BBL reports no
  SPP of its own). A merged match's events come from both source rows' pages.
  Runs after matches, teams, and players (all referenced).
- **SPP adjustments** (in `PlayersModule`) — `BblSppAdjustmentsImportService` reconciles
  `players.spp_adjustment` and `players.spp_total` for every imported player:
  since BBL's displayed career SPP total was recalculated at BB2020 rates when
  the site re-platformed, the server compares it against a forced-rate replay
  of the player's events to recover the unexplained remainder as
  `spp_adjustment`, then rebuilds `spp_total` as the era-correct event sum plus
  that adjustment. Runs after match events, since it depends on
  `match_events.spp_value` already being populated. A player whose skills were
  not all written (a skill whose upsert failed, or every player when a skill
  sync failed) is sent without BBL's unspent figure, so the server does not
  settle a skill's source from an incomplete history. As for a page with no
  figure, the server then stores none, replacing any figure stored earlier
  until the next run that writes every skill.
- **TrophyAwardsModule** — `BblTrophyAwardsImportService` records every team
  and player award from the competition results pages' trophy tables (read via
  the already-described `CompetitionTrophyPageParser` /
  `BblCompetitionTrophyReaderService`), resolving each award to a
  previously-curated trophy (seeded by `tools/import-manual`, which always runs
  first) and to the winning team era or player. Runs after team participation
  and players (it needs their resolved team-era/player ids) and after match
  outcomes (see the note in the MatchesModule paragraph above).

API calls go through `packages/import` — the shared import services that other
`tools/import-*` tools reuse — which in turn call the API through
`packages/api-client`. No tool talks to the API directly.

Imports are close to idempotent, but not exactly: re-running never creates
duplicates (records are matched by their external IDs), yet the same import can
still change the database. For example, another tool may have altered the
underlying data since the last run, or import-bbl may have been improved to
extract more than before — in which case existing records are updated.
Re-running is always safe and fills any gaps left by transient failures.

### Reference resolution

Where an import step needs the database id of an entity it does not create
itself — an era's league and rules sets, a competition's era, a team's race
and coach, a player's position, a competition id — it asks the API to resolve
that entity's external id (see
[RPC conventions](../api/rpc-conventions.md#reference-resolution)). Each step
resolves everything it needs in one batched call and then looks the records up
locally, so the network cost is one round trip per step, not per record.

The ordering in `main.ts` matters: a race has to be upserted before a team
referencing it can be resolved.

Some maps deliberately remain. The player id map (`playerIdsByPid`) collects
the ids the player upserts return and is handed to the later steps that need
them (match events, trophy awards). The others cannot be answered by an
external-id resolve: payload carriers that get re-upserted later (`competitionsByBblId`,
`teamsByCode`, `racesByRaceId`), a race's display name (`racesByBblId`), a
team-to-race relationship (`teamRaceIdsByCode`), `team_eras` and `race_eras`
rows (which have no external ids of their own), derived classification and
evidence sets, and matches (which have no resolve procedure).

## Data types

What the importer reads and how each entity is keyed: see
[data-types.md](data-types.md). See also [file-format.md](file-format.md) and
[prototype.md](prototype.md).
