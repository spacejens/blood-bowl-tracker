# import-bbl

`tools/import-bbl/` imports data from the BBL league website into the tracker
via the API. The source data is a `wget` mirror: a folder of HTML pages named
`default.asp?p=<type>&<params>`, encoded ISO-8859-1.

## Configuration

Configuration is supplied through environment variables — an `.env` file in the
tool directory, or exported in your shell:

- `BBL_DATA_DIR` — path to the folder that directly contains the
  `default.asp?p=...` files. This is a subfolder of the git-ignored `data/`
  directory (each `wget` download lands in its own subfolder). A relative path
  resolves against the current working directory. Ask the developer for the
  download if you don't have it.
- `BBL_LEAGUE_NAME` — the name of the league the BBL data covers. The BBL data
  mirror covers a single league whose name is not present in the data, so it is
  supplied here. Used as the league's external ID under both the `BBL` and
  `Name` external systems.
- `BBL_ERAS` — a JSON array describing the eras the league played through. Each
  entry has `name`, `rulesSet` (the rules set's name), `startDate` (required,
  ISO `YYYY-MM-DD`), `endDate` (optional — omit for an era still ongoing),
  `firstPlayerId` (required, positive integer), `lastPlayerId` (optional,
  following the same still-ongoing rule as `endDate` — the two must be either
  both omitted or both present; when `lastPlayerId` is omitted, the era
  matches any pid `>= firstPlayerId` with no upper bound), and
  `playerIdOverrides` (an optional array of pids explicitly assigned to this
  era, checked before the range bounds — BBL player ids are only roughly
  chronological, so a handful of players drafted right at an era changeover
  can land on the "wrong" side of a range split; overrides correct those known
  exceptions without widening the range). Rules sets and eras are not present
  in the source data, so they are supplied here. Each era's rules set name and
  each era name are used as external IDs under both the configured BBL
  external system and the `Name` external system.
- `BBL_EXTERNAL_SYSTEM_NAME` — the name of the external system that BBL
  records are registered under. Defaults to `BBL` if unset or empty, so most
  deployments can leave it out.
- `API_BASE_URL` — base URL of the running api-server to import into. Defaults
  to `http://localhost:3000` (a local docker-compose deployment) if unset.

## Run it

1. Copy the template and fill in real values:
   ```bash
   cp tools/import-bbl/.env.example tools/import-bbl/.env
   ```
   `tools/import-bbl/.env` is git-ignored, so your configuration is never
   committed.
2. Run the tool from the `tools/import-bbl/` directory so the `.env` is picked
   up automatically:
   ```bash
   pnpm --filter @blood-bowl-tracker/import-bbl run start
   ```

## Architecture

- **SourceModule** — reusable, data-type-agnostic core. `BblSourceReader`
  walks the data folder, classifies files by page type (`p=` param), decodes
  ISO-8859-1, and streams pages one at a time (`pages(type)`), keeping memory
  bounded. This is the pattern future data types reuse.
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
  reads a position's name, its "Can play for" races, and whether it is a star
  player (the `None (star player)` marker) from a `p=pt` page;
  `BblPositionsImportService` streams position pages and imports one row per
  (position, race) pair. Positions that list no race are reverse-engineered from
  player pages (`PlayerPageParser`, see PlayersModule): each of the position's
  players belongs to a team whose race is known, so the position's race(s) are
  recovered from `teamRaceIdsByCode`. Runs after races and teams.
- **PlayersModule** — data-type extractor for players. `PlayerPageParser` reads
  a player's own `pid`, `<h1>` name, position (`p=pt&typID`), and team
  (`p=tm&t`) links off a `p=pl` page. The positions import uses the
  position/team links to resolve the races of positions that list none;
  `BblPlayersImportService` streams player pages and imports one row per
  player, resolving its team era (via the team code and the era whose
  configured player-id range contains the pid) and position (via the composite
  `<typID>-<raceBblId>` key). Runs after teams, team eras, and positions (all
  referenced).
- **TeamsModule** — data-type extractor for teams. `TeamPageParser` reads a
  team's page id and `<h1>` name from a team page; `BblTeamsImportService`
  streams team pages (independently of the coaches/races walks), deduplicates
  teams by page id, resolves each team's race and coach foreign keys from the
  id maps returned by the races and coaches imports, and upserts each through
  the API. Runs after races and coaches, since it depends on both.
- **MatchesModule** — data-type extractor for matches. `MatchListPageParser`
  reads each match's date, home/away team names, and numeric BBL id (`m=<id>`,
  from the row's `onclick` link `default.asp?p=m&m=<id>`) off a competition's
  match-list page (`p=ma&so=s&s=<id>`). `BblMatchListReaderService` performs the
  single, memoized walk over `pages('ma')` and returns the parsed `BblMatch[]`
  per competition; the competitions and team-participation imports both consume
  it instead of each walking the `ma` pages themselves.
  `BblMatchesImportService` upserts each completed match, keyed by its numeric
  BBL id under the competition's BBL external system (matches have no `Name`
  external id), with `competitionId` resolved to the imported competition's DB
  id. Runs after competitions, its only dependency. Per-team results/scores and
  per-player events (`match_teams`/`match_events`) remain out of scope.
- **CompetitionsModule** — data-type extractor for competitions.
  `CompetitionListPageParser` reads every competition's numeric BBL id and name
  off the master dropdown embedded on any `se`/`sr` page (one page suffices).
  `BblCompetitionsImportService` reads that list, then reads each competition's
  matches (via `BblMatchListReaderService`) to derive its `type` (season vs
  cup, from the date span) and `eraId` (the era containing its earliest match
  date), and upserts each through the API. Runs after eras, whose
  `eraIdsByName` map it uses to resolve `eraId`.

- **TeamParticipationModule** — derives the team↔era, competition↔team, and
  race↔rules-set links from real match participation (it imports no new source
  pages of its own). `BblTeamParticipationImportService` reads each
  competition's matches via the shared `BblMatchListReaderService` (home/away
  team names), resolves each name to an imported team, syncs that team's era
  (`team_eras`), collects the resulting team-era ids onto the competition
  (`competition_teams`), and records each team's race against its era's rules
  set (`race_rules_sets`). Runs after teams (whose `teamsByName` map it
  resolves names against) and after competitions and rules sets (whose payload
  maps it re-upserts to attach the links). Team names that don't match an
  imported team are recorded as errors and skipped.

API calls go through `packages/import` — the shared import services that other
`tools/import-*` tools reuse — which in turn call the API through
`packages/api-client`. No tool talks to the API directly.

Imports are close to idempotent, but not exactly: re-running never creates
duplicates (records are matched by their external IDs), yet the same import can
still change the database. For example, another tool may have altered the
underlying data since the last run, or import-bbl may have been improved to
extract more than before — in which case existing records are updated.
Re-running is always safe and fills any gaps left by transient failures.

## Data types

- **Leagues** — a single league from the `BBL_LEAGUE_NAME` config value (not
  parsed from the data). Keyed by that name under the configured BBL external
  system (`BBL` by default) and the `Name` external system. Imported before
  coaches, as the foundational entity.
- **Rules sets** — the distinct `rulesSet` names across the `BBL_ERAS` config
  (not parsed from the data). Keyed by that name under the configured BBL
  external system and the `Name` external system. Imported after the league.
- **Eras** — from the `BBL_ERAS` config (not parsed from the data). Each era
  references its league and its rules set (both imported first) and carries a
  `startDate` and optional `endDate`. Keyed by the era name under the
  configured BBL external system and the `Name` external system. Imported
  after rules sets.
- **Coaches** — from team pages (`p=tm`). Keyed by exact name under the
  configured BBL external system (`BBL` by default) and the `Name` external
  system.
- **Races** — from team pages (`p=tm`) and the `p=tl` master race-list page.
  Keyed by their numeric BBL id (from the race link `default.asp?p=tl#<id>` on a
  team page, or the numeric anchor on the `tl` page) under the configured BBL
  external system (`BBL` by default), and by exact name under the `Name`
  external system. Team pages are scanned first and win on any shared id; the
  `tl` page is a gap-filling second source that adds races with no team page
  (e.g. College of Shadow, College of Light). A race that only appears on
  old/retired team pages and has since dropped off the `tl` list still imports
  from the team-page pass.
- **Positions** — from position pages (`p=pt`). A position page lists the race(s)
  it can play for; one row is imported per (position, race) pair, keyed by the
  composite `<typID>-<raceBblId>` under the configured BBL external system and by
  `<raceName>: <positionName>` under the `Name` external system. Positions that
  list no race are reverse-engineered from player pages: a **star player** (marked
  `None (star player)`) imports as one entity with a relation to each resolved
  race and an extra `Name` external id of its bare name; a **defunct-race
  position** imports as duplicate rows, each flagged as a historical (deleted)
  relation. A position that lists no race and has no players in the data is
  skipped with a recorded error. Imported after races and teams (both referenced).
- **Teams** — from team pages (`p=tm`). Keyed by the team's alphanumeric page
  id (`t` param) under the configured BBL external system (`BBL` by default),
  and by its `<h1>` name under the `Name` external system. Each team's race and
  coach are resolved to local ids from the races and coaches imports, which run
  first. Retired teams are imported like any other; the "Retired!" marker is
  not tracked yet.
- **Players** — from player pages (`p=pl`). Keyed by the player's own numeric
  `pid` under the configured BBL external system only — unlike other entities,
  players get no `Name` external id, since player names are not guaranteed
  unique across the league. A player's era is resolved from its `pid`, first
  checking each era's `playerIdOverrides` list, then falling back to each
  era's `firstPlayerId`/`lastPlayerId` range; its team era and position are
  resolved to local ids from the teams and positions imports. A
  player whose pid matches no configured era range, whose team code was not
  imported, or whose position cannot be resolved is skipped with a recorded
  error. Imported after teams, team eras, and positions (all referenced).
- **Competitions** — from the master competition dropdown on the `se`/`sr`
  pages (id/name) plus each competition's `p=ma&so=s&s=<id>` match-list page
  (dates). Keyed by the numeric BBL id (`s` param) under the configured BBL
  external system (`BBL` by default) and by exact name under the `Name` external
  system. `type` is `cup` when the match dates span 3 days or fewer, else
  `season`; `eraId` is the era whose configured date range contains the earliest
  match date. A competition with no dated matches, or whose earliest date is
  outside every configured era, is skipped with a recorded error. The `p=cp`
  pages are out of scope (generic content pages, not reliably competitions).
  Imported after eras (referenced by `eraId`).
- **Matches** — from a competition's `p=ma&so=s&s=<id>` match-list rows
  (id/date/competition). Keyed by the numeric BBL match id (`m=<id>`, from
  each row's `onclick` link) under the configured BBL external system only —
  there is no `Name` external id, since matches have no natural name. The
  played date is the row's "result added" date. Imported after competitions
  (referenced by `competitionId`). Per-team results and per-player events are
  future work.

- **Team eras / Competition teams / Race rules sets** — append-only join links
  derived from match participation, not read from any single page. A team is
  linked to an era (`team_eras`) when it played a completed match in a
  competition whose era covers that match; the competition is linked to that
  team-era (`competition_teams`); and the team's race is linked to the era's
  rules set (`race_rules_sets`). These are historical facts, so the syncs only
  ever insert missing links — they never update or delete. A match-row team name
  that matches no imported team is skipped with a recorded error.

Imported records are matched across systems by external IDs (a coach, for
example, carries an external ID under the configured BBL external system and
another under `Name`); other imported game-data types carry external IDs in
the same way.

See also:

- [file-format.md](./file-format.md) — working notes on the source HTML format.
- [prototype.md](./prototype.md) — note on the earlier prototype implementation.
