# import-bbl data types

Names are written only when this importer creates a row: a coach,
competition, skill, position, team or race that already exists keeps its
stored name, which `tools/import-manual` may have curated (see
[Upserts overlay](../api/imports.md#upserts-overlay-they-do-not-replace)).

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
- **Position characteristics** — from the same `p=pt` page, written to
  `position_rules_sets`. A position gets one row per rules set eligible for
  it (positive evidence only — an override, star-player status, or recorded
  player use; the same rule as race-era availability), not hardcoded to
  BB2020: an era spanning a rules-set change yields a row per rules set in
  that span, all carrying the same scraped values, since BBL is a single
  BB2020-era snapshot. BBL only inserts these rows (`insertOnly`): a row that
  already exists is left alone, so a re-run never rewrites the values TP's
  later run writes for the same pair. Because the writes are insert-only, a
  later change to BBL's conversion code or a corrected BBL mirror never reaches
  rows that already exist (including BBL-only pairs TP never covers); correct
  them through a data migration, or by dropping and re-importing, as
  [Re-running importers](../database.md#re-running-importers) describes.
  The three pre-BB2020 rules sets are the exception:
  BBL writes no row for a rules set with bare Agility and Armour
  (`agilityFormat: 'bare'` — CRP, CRP+, BB2016), because one BB2020
  snapshot cannot describe them; values come only from `tools/import-manual`'s
  curated after-phase file. A position with no positive evidence for a rules
  set gets no row at all — not even a wrong one — including under BB2020;
  gaps are filled by hand in `tools/import-manual`. `Passing` is resolved per
  target rules set: `null` where the rules set declares no Passing
  characteristic, and otherwise the scraped value, or `0` where the page
  showed `-` — a position that cannot pass under a rules set with Passing.
  One sync call is made per position, so rejected characteristics do not sink
  the rest of the run. A position whose characteristics table could not be
  read records an error and is skipped; its identity still imports. Imported
  after rules sets, positions, and positions_race_eras (all referenced).
- **Position starting skills** — the `Skills` column of the same `p=pt` page,
  written to `position_rules_set_skills`. Starting skills are inserted only
  (`insertOnly`): an existing (position, rules set, skill) row keeps its
  attribute value, so TP's later spelling of it is not rewritten on a BBL
  re-run. Because the writes are insert-only, a later change to BBL's
  conversion code or a corrected BBL mirror never reaches rows that already
  exist (including BBL-only pairs TP never covers); correct them through a
  data migration, or by dropping and re-importing, as
  [Re-running importers](../database.md#re-running-importers) describes.
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
  error.
  Its scraped MA/ST/AG/PA/AV line is sent with the upsert, validated
  server-side against the last rules set listed for the player's era (an era
  can span several, listed oldest-first). `Passing` is resolved the same way
  position characteristics are: `null` where that rules set declares no
  Passing characteristic at all, and otherwise the scraped value, or `0` where
  the page showed `-`. BBL's BB2016-to-BB2020 conversion wrote a Passing value
  onto most players, including many whose era has no such characteristic, so
  the page's own figure never decides this — the rules set does. A player whose
  characteristics line cannot be read fails page parsing outright and is
  skipped with a recorded error, as is one whose era names a rules set that was
  not imported.
  Imported after rules sets, teams, team eras, and positions (all referenced).
- **Competitions** — from the master competition dropdown on the `se`/`sr`
  pages (id/name) plus each competition's `p=ma&so=s&s=<id>` match-list page
  (dates). Keyed by the numeric BBL id (`s` param) under the configured BBL
  external system (`BBL` by default). `type` is `cup` when the match dates
  span 3 days or fewer, else `season`; `eraId` is the era whose configured
  date range contains the earliest match date, considering only eras with
  `autoAssignByDate: true` — an era with `autoAssignByDate: false` is reached
  only through its `competitions.overrides` entries. A competition listed in
  an era's `competitions.overrides` is instead hard-assigned that era and
  forced to that entry's `type`, bypassing match-date resolution entirely —
  but its `startDate`/`endDate` still come from its own matches when it has
  any, falling back to that override entry's configured dates only when it
  has none. `startDate`/`endDate` (`YYYY-MM-DD`) are set on every imported
  competition from the earliest/latest date among its matches (or, for a
  match-less override, from its `competitions.overrides` entry). A
  competition with no dated matches, no configured override dates, and no
  applicable override at all, or whose earliest date is outside every
  configured era, is skipped with a recorded error. The `p=cp` pages are out
  of scope (generic content pages, not reliably competitions).
  Imported after eras (referenced by `eraId`).
- **Matches** — from a competition's `p=ma&so=s&s=<id>` match-list rows
  (id/date/competition). Keyed by the numeric BBL match id (`m=<id>`, from
  each row's `onclick` link) under the configured BBL external system only —
  there is no `Name` external id, since matches have no natural name. The
  played date is the row's "result added" date. Imported after competitions
  (referenced by `competitionId`). Per-team results and per-player events are
  both imported by later steps: see the MatchesModule bullet in
  [Architecture](index.md#architecture) for per-team results and outcomes, and
  the MatchEventsModule bullet for per-player events.
  A pair configured under an era's `matches.merges` (per-era; see
  [Configuration](index.md#configuration)) is imported as a single match
  rather than two: BBL cannot record a match with more than two teams, so each
  four-team "Bierhallentodball" final exists as two two-team rows that this
  import folds back into one N-team match (both external ids, four teams, and
  the union of both rows' events). A match id
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
