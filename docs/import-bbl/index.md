# import-bbl

`tools/import-bbl/` imports data from the BBL league website into the tracker
via the API. The source data is a `wget` mirror: a folder of HTML pages named
`default.asp?p=<type>&<params>`, encoded ISO-8859-1.

## Configuration

Configuration is supplied through a JSON5 file, `import-bbl-config.json5`, in
the tool directory (`tools/import-bbl/`). JSON5 allows comments and multi-line
structured values, so the era and match-merge lists can be documented and
formatted inline. The file is the sole configuration source. Top-level keys are
camelCase, grouped into nested objects by concern:

- `dataDir` — path to the folder that directly contains the
  `default.asp?p=...` files. This is a subfolder of the git-ignored `data/`
  directory (each `wget` download lands in its own subfolder). A relative path
  resolves against the current working directory. Ask the developer for the
  download if you don't have it.
- `externalSystemName` — the name of the external system that BBL
  records are registered under. Defaults to `BBL` if unset or empty, so most
  deployments can leave it out.
- `connection` — runtime settings for reaching the api-server to import into.
  The group itself is required (even though its only current field is
  optional), so a future mandatory field under it doesn't need a breaking
  change to introduce.
  - `apiBaseUrl` — base URL of the running api-server to import into. Defaults
    to `http://localhost:3000` (a local docker-compose deployment) if unset.
- `leagues` — an array of the leagues the BBL data covers. Each entry has a
  `leagueName` and an `eras` array. The BBL data mirror covers a single league
  whose name is not present in the data, so league names are supplied here. Each
  league name is used as that league's external ID under both the `BBL` and
  `Name` external systems. Rules sets and eras are not present in the source
  data, so they are supplied here. **Nota bene: era names must be unique across
  all leagues**, since they feed a single flat era map downstream.
  - `leagueName` — the name of a league the BBL data covers.
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
    - `competitions` (optional) — `seasonCompetitionIdOverrides` and
      `cupCompetitionIdOverrides`, optional arrays of competition bblIds
      hard-assigned to this era and forced to type `season` or `cup`
      respectively, regardless of match dates — used for a competition with an
      empty match list, or one whose date-span would otherwise misclassify its
      type.
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

    A competition bblId may appear in only one of the two competition override
    lists across all eras; a team code in only one era's `teamCodeOverrides`;
    a match id in only one `matches.merges` pair across all eras; and a match
    id in only one `matches.categoryOverrides` entry across all eras. Rules
    sets and eras are not present in the source data, so they are supplied
    here. Each era's rules set names and each era name are used as external
    IDs under both the configured BBL external system and the `Name` external
    system.

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
  DB id. Runs after competitions, its only dependency. Per-team results/scores and
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
  race↔era links from real match participation (it imports no new source
  pages of its own). `BblTeamParticipationImportService` reads each
  competition's matches via the shared `BblMatchListReaderService` for grouping,
  resolves each match's two team ids from `BblMatchDetailReaderService`, and
  resolves those ids to imported teams via the teams import's `teamsByCode` map,
  syncs that team's era (`team_eras`), collects the resulting team-era ids onto
  the competition (`competition_teams`), and records each team's race against the
  era (`race_eras`). Runs after teams, races, and competitions (whose payload
  maps it re-upserts to attach the links). Team ids that don't match an imported
  team, and matches with no detail page, are recorded as errors and skipped.

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

- **Leagues** — one league per `leagues[]` entry, each from its `leagueName`
  config value (not parsed from the data). Each league is keyed by that name
  under the configured BBL external system (`BBL` by default) and the `Name`
  external system. Imported before coaches, as the foundational entity.
- **Rules sets** — the distinct names across all eras' `rulesSets` arrays in
  the `eras` config (not parsed from the data). Keyed by that name under
  the configured BBL external system and the `Name` external system. Imported
  after the league.
- **Eras** — from the `eras` config within each `leagues[]` entry (not parsed
  from the data). Each era references its league (from its containing
  `leagues[]` entry) and one or more rules sets (all imported first) and carries
  a `startDate` and optional `endDate`. Keyed by the era name under the
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
  unique across the league. A player's era is resolved first by each era's
  `teamCodeOverrides` (matching the player's team code), then by each era's
  `playerIdOverrides` list, then by falling back to each era's
  `firstPlayerId`/`lastPlayerId` range — that range fallback only considers
  eras with `autoAssignByPlayerId: true`; an era with `autoAssignByPlayerId:
false` is reached only through `teamCodeOverrides`/`playerIdOverrides`. Its
  team era and position are resolved to local ids from the teams and
  positions imports. A
  player whose pid matches no configured era range, whose team code was not
  imported, or whose position cannot be resolved is skipped with a recorded
  error. Imported after teams, team eras, and positions (all referenced).
- **Competitions** — from the master competition dropdown on the `se`/`sr`
  pages (id/name) plus each competition's `p=ma&so=s&s=<id>` match-list page
  (dates). Keyed by the numeric BBL id (`s` param) under the configured BBL
  external system (`BBL` by default). `type` is `cup` when the match dates
  span 3 days or fewer, else `season`; `eraId` is the era whose configured
  date range contains the earliest match date, considering only eras with
  `autoAssignByDate: true` — an era with `autoAssignByDate: false` is reached
  only through its
  `seasonCompetitionIdOverrides`/`cupCompetitionIdOverrides`. A competition
  listed in an era's `seasonCompetitionIdOverrides`
  or `cupCompetitionIdOverrides` is instead hard-assigned that era and forced
  to type `season` or `cup` respectively, bypassing match-date resolution
  entirely. A competition with no dated matches, or whose earliest date is
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
  A pair configured under an era's `matches.merges` (folded from the old
  top-level `matchMerges` list, now per-era; see Configuration above) is
  imported as a single match rather than two: BBL cannot record a match with
  more than two teams, so each four-team "Bierhallentodball" final exists as
  two two-team rows that this import folds back into one N-team match (both
  external ids, four teams, and the union of both rows' events). A match id
  may appear in only one `matches.merges` pair across all eras. The merged
  match's played date is the earliest of the pair's two source dates.

- **Team eras / Competition teams / Race eras** — append-only join links
  derived from two sources, unioned per competition: real match participation,
  and each competition's standings page (`p=se&s=<id>`), which lists every
  registered team — including teams that played no matches. A team is linked to
  an era (`team_eras`) when it played a completed match in, or is registered
  for, a competition whose era covers it; the competition is linked to that
  team-era (`competition_teams`); and the team's race is linked to that era
  (`race_eras`). These are historical facts, so the syncs only ever insert
  missing links — they never update or delete. A registered-but-unplayed team
  contributes no `match_teams` rows. A team id that matches no imported team, a
  match with no detail page, and a standings row with no team code are skipped
  with a recorded error.

Imported records are matched across systems by external IDs (a coach, for
example, carries an external ID under the configured BBL external system and
another under `Name`); other imported game-data types carry external IDs in
the same way.

See also:

- [file-format.md](./file-format.md) — working notes on the source HTML format.
- [prototype.md](./prototype.md) — note on the earlier prototype implementation.
