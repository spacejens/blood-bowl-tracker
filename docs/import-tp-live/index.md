# import-tp-live

`packages/import-tp-live` imports one TP team, one completed TP match with
its teams and competition, one TP competition with its registered teams and
trophy awards, or TP's official team list for every rules set, straight into
the database. It is server-side code: it calls `packages/game-data`
in-process and never goes over RPC. The live entry points and the RPC
procedures use it:

- **The live team import**, `TpLiveTeamImportService.importTeam(...)`, which
  fetches a roster from TP's API first. `apps/discord-bot`'s
  [`/importtp`](../discord-bot/slash-commands/import-tp.md) and its
  [TP notification feed](../discord-bot/tp-feed.md) call it, and the other
  live entry points below, in-process.
- **The live match import**, `TpLiveMatchImportService.importMatch(...)` —
  see [match-import.md](match-import.md).
- **The live match-teams import**,
  `TpLiveMatchTeamsImportService.importMatchTeams(...)`, which imports
  both teams of a match in any state, finished or not — see
  [match-import.md](match-import.md#importing-a-matchs-teams-live).
- **The live competition import**,
  `TpLiveCompetitionImportService.importCompetition(...)` — see
  [competition-import.md](competition-import.md).
- **The live official-teams import**,
  `TpLiveOfficialTeamsImportService.importOfficialTeams(...)` — see
  [official-teams-import.md](official-teams-import.md).
- **The `tpRosters.import` RPC procedure**, which `packages/api-server`
  implements with it. `tools/import-tp`'s bulk run calls that procedure once
  per downloaded roster file, so a bulk import and a live one import a team
  the same way.
- **The `tpMatches.import` RPC procedure** — see
  [match-import.md](match-import.md).
- **The `tpCompetitions.import` RPC procedure** — see
  [competition-import.md](competition-import.md).
- **The `tpOfficialTeams.import` RPC procedure** — see
  [official-teams-import.md](official-teams-import.md).

## What it owns

- **Live fetch**: every live fetch service (roster, match, official teams,
  awards, inscriptions, bracket) builds its requests as `packages/tp-paths`
  `TpRequest`s and makes them through `TpRequestFetchService`, which fetches
  through `packages/scrape-tp`, rethrows a TP block (`TpBlockedError`) so the
  whole import stops, and records any other failure as one ImportError
  (`Could not fetch <what>: <reason>`). `TpRosterFetchService`, for example,
  builds its request with `TpRosterPathsService` and parses the response with
  `packages/parse-tp`'s `RosterParserService`.
- **Era resolution**: `TpEraResolutionService` (see below).
- **Roster import**: `TpRosterImportService`, in `TpRosterModule`. It
  resolves the TP and Name external systems, the era and the era's rules
  set, upserts the team, then upserts its players. Given the roster's raw
  JSON (the live import and the bulk `tpRosters.import` path both pass it),
  it then syncs each player's own skills through
  `TpRosterPlayerSkillsService` and `TpRosterSkillIdsService`, naming each
  skill from the skill masters that JSON embeds.
- **The live team entry point**: `TpLiveTeamImportService.importTeam(...)`,
  in `ImportTpLiveModule`.
- **SPP adjustments**: `TpPlayerSppFactsService` builds each imported
  player's SPP facts, and `TpLiveSppAdjustmentsService` settles them through
  game-data's `SppAdjustmentsService` at the end of a live match or
  competition import (never of a team import alone).
- **Match import**: `TpMatchModule`, with `TpMatchImportService` and its
  match-context, star-player-hire, upsert, events and outcome services, plus
  `TpLiveMatchImportService`, `TpLiveMatchTeamsImportService` and their
  match/bracket fetch services — see [match-import.md](match-import.md).
- **Competition import**: `TpCompetitionModule`, with
  `TpCompetitionImportService` and its upsert, participant and trophy-award
  services (the upsert is shared with the live match import), plus
  `TpLiveCompetitionImportService` and its inscriptions/awards fetch
  services — see [competition-import.md](competition-import.md).
- **Official team list import**: `TpOfficialTeamsModule`, with
  `TpOfficialTeamsImportService` and its context, race, position,
  characteristics, keyword, starting-skill and skill-category
  (`TpOfficialSkillCategoriesSyncService`) services, the
  `TpOfficialBatchSyncService` those sync services share for batched writes,
  plus `TpLiveOfficialTeamsImportService` and `TpOfficialTeamsFetchService` —
  see [official-teams-import.md](official-teams-import.md).

## Importing a team live

```ts
const { team, players } = await tpLiveTeamImportService.importTeam({
  rosterId: 163386,
  externalSystemName: TP_EXTERNAL_SYSTEM_NAME,
});
```

- `rosterId`: TP's roster id, the number in the team's roster page URL.
- `era`: optional. The era to import the team under, by name. If left out,
  it is resolved automatically.
- `externalSystemName`: required. The name TP's external system is
  registered under. Callers pass `TP_EXTERNAL_SYSTEM_NAME` from
  `packages/domain-enums`, the name the bulk import registers TP data under.
- `session`: optional. A `packages/scrape-tp` session to fetch through. A
  caller importing several teams in one go should pass one session, so their
  requests are paced as one visit. If left out, the import starts its own.

The result carries two `ImportResult`s: `team` (the team upsert, plus any
failure before it) and `players`. It also names the era the team was
imported under (`era`), undefined when the team was not imported, and its
team era's numeric ids (`teamEra`, as `{ id, eraId }`), undefined when the
team, or its team era for that era, could not be resolved. `sppPlayers`
lists each imported player's id, the career SPP total TP reports for it and,
for a roster player, TP's career action counts; empty when the team was not
imported.

A team import on its own never computes SPP adjustments: the players'
match events may not be imported yet, so `spp_adjustment` stays as it was
(NULL for a new player) and `spp_total` is TP's reported total. A live match
or competition import settles both once the events are in (see
[match-import.md](match-import.md) and
[competition-import.md](competition-import.md)).

A team needs no competition. It is a complete entity on its own, and TP's
roster data carries no competition either. See [match-import.md](match-import.md)
for how a live match import ties a team and a competition together.

What must already be in the database:

- the team's race (by its TP race code);
- the era, with the rules set it declares;
- the positions its players play (by TP `lineUpMasterId`).

The team's coach need not exist yet. It is upserted from the roster's own
coach: its TP coach id (`player.applicationUserId`) and name
(`player.userNameToShow`), keyed by both the TP id and the Name system. An
unknown coach is created under the roster's name; a known one keeps its stored
name. The team's own name is likewise set only when the team is created. TP's
roster carries no NAF number, so a coach created
live has none until a later bulk import (`tools/import-tp` or
`tools/import-bbl`) adds it.

A missing race or a failed coach upsert skips the team, and a missing
position skips that player. Each is reported as an error.

A live team import brings in the roster's current state only. It has no
match data, so it adds no departed players seen only in match snapshots —
unless the caller passes the match's roster snapshot, which is what a live
match import does for each of its two teams (see
[match-import.md](match-import.md)) so a player who has since left the
roster still exists to be referenced by the match's events. Nor does it add
star players hired through inducements: those appear only in match events,
and a live match import adds them (see
[match-import.md](match-import.md#star-player-hires)).
It does send characteristics, lasting injuries and characteristic
increases, validated against the rules set the era declares, each roster
player's skills, and each player's status (active, dead, retired,
temporarily retired or unknown), derived from TP's `state` and `isActive`
exactly as the bulk import does (see
[Player status](../import-tp/index.md#player-status)). A departed player
added from a match snapshot gets a status from the snapshot too, decided
the same way as a roster player's. A team import also retires the team era's stored TP players
who are in neither the roster nor the snapshots, unless already dead, and does
nothing of the kind when the roster lists no players (see the same section).

Skills are written to `player_advancements`: the position template's as
`starting`, the player's gained ones as `chosen` or `random` (TP's own
`isRandom`), numbered as described in [Order of advancements](#order-of-advancements). A gained skill TP flags `isExtra` is written as a free extra. TP names a skill only by
id, so the roster's own JSON is scanned for the skill names it embeds; a
named skill is upserted under the Name system and every TP id the roster
gives it. An id the roster does not name resolves through a skill already
carrying it as a TP external id — registered by an earlier import, or
curated in `tools/import-manual` (`data/batches/001-initial-seed/skills.json5`; curate a new one in a new batch, see [Batches](../import-manual/batches.md)).
A Hatred or Animosity target, which TP writes as an opaque keyword code, is
named through the curated keyword catalogue
(`data/batches/001-initial-seed/keywords.json5`; curate a missing one in a new batch, see [Batches](../import-manual/batches.md)). A player seen only in a
match snapshot carries no skill data, so contributes none.

### Order of advancements

TP names no order for a player's characteristic increases. Its gained skills
come in a list, and each carries its own row id. Both the live import and the
bulk `tpRosters.import` read the player's stored advancements before writing.

The gained skills are taken in ascending row-id order when the player has at
least two and each carries a row id no other one shares, and in TP's list
order otherwise. The row ids are a counter shared by every player, and their
order fits the SPP spent wherever that was checked (see [What the parser
extracts](../import-tp/file-format-rosters.md#what-the-parser-extracts));
TP's list order often does not. Below, "the gained order" is whichever of the two applies.

A player with nothing stored has no baseline, so every paid advancement (not
a starting skill or free extra) is numbered from 1: gained skills in the
gained order, then increases in MA/ST/AG/PA/AV order. When TP's SPP figures
are known, the import takes the spend as TP's total SPP less its unspent
figure and prices every assignment of those numbers with the cost model. In
the row-id order, only an assignment that keeps the new skills in that order
counts; increases have no row id, so they can take any place. One fitting
order is written confirmed. When several fit and all cost the same, the
fallback order above is written confirmed, since the choice cannot change a
cost. Otherwise (fitting orders that cost differently, none fitting, more than
six advancements to order, or missing SPP figures) the numbers are written
unconfirmed.

In the live import, an advancement not stored before is new, since the import
runs after a match and it was taken since the last one; it comes after every
stored one, and its number counts paid advancements only. A lone new
advancement is appended at the next number and written confirmed, unless TP's
SPP figures are known and the cost model finds the spend does not allow it
there, when it is left unconfirmed. Several new ones are ordered from the
spend as above, numbered after the stored ones. Increases already stored are
resent as stored, so a confirmed order is never replaced by a guess.

In the bulk import, only a stored paid advancement with a confirmed order is
history to keep. A bulk import of a player with one cannot tell when the rest
was taken, so it sends the gained skills at their position in the gained
order and the increases with an unknown order, all unconfirmed. It rewrites a
stored skill's unconfirmed order to that position (and an unconfirmed
increase's to unknown), while a confirmed stored order is never overwritten.
A bulk import of a player without one (nothing stored, only starting skills
or free extras, or only paid advancements of unconfirmed order) treats him as
a player with nothing stored: every paid advancement is numbered from 1 and ordered from the
spend as above, the stored unconfirmed rows rewritten with the new numbers.
So a later bulk pass, for one run after the advancement costs exist, can
deduce and confirm what an earlier pass left unconfirmed.

A free extra keeps its position in the gained order, unconfirmed and outside
the paid numbering, so it can share a number with a paid advancement. Free
extras are found before numbering by the same rule the write applies: TP's
`isExtra` flag, a gained Hatred, or a skill one of the player's own trophy
awards grants, even when TP leaves the flag off.

TP's data has no timestamps and no per-skill history. Its skill row ids are
not monotonic with list position (one sampled player's gained skills carry
ids 1597390, 1812869 and 1597388 in list order), but their order fits the
spend in every checked case where the spend rules some orders out: 49 of 49
players whose order was already confirmed and 34 of 34 whose order was not,
against 27 of 49 and 1 of 34 for the list order. They are evidence of the
order, not proof, so they only narrow what the spend can confirm and never
confirm an order by themselves. A characteristic increase has no row id, so
the spend is the only evidence of where it falls. A bulk snapshot has no
stored baseline either.

### Mercenary availability

A mercenary Big Guy (e.g. "Giant Mercenary") appears on no TP official-list
catalog, so where it may be fielded is derived from actual hires: after a
roster's players are imported, every mercenary position it hired is recorded
as available to the roster's race in the import's era (`positions_race_eras`,
upsert-only). Bulk and live roster imports both do this. An unresolvable race
code is one error on the `players` result, and a race the era does not list
(no `race_eras` row) is one error per mercenary position; the players stay
imported.

## Era resolution

TP's roster names no era. An era passed explicitly is used once it is found
in the database. An unknown one is not imported. Otherwise the team's race
is looked up by its TP race code, and the race's ongoing eras (eras it is
linked to with no end date) decide it:

- exactly one: that era is used;
- none: the team is not imported;
- several: the team is not imported, and the caller must name the era. A
  race belongs to Dungeon Bowl or to normal play, never both, so several
  ongoing eras for one race is a genuine ambiguity — e.g. the race is
  available across two overlapping normal eras — not something to guess at.

The live import registers TP's external system under the
`externalSystemName` its caller passes; there is no default. Every caller in
this repository passes `TP_EXTERNAL_SYSTEM_NAME`.

## The `tpRosters.import` procedure

Input: the roster JSON exactly as TP's API returns it (parsed server-side),
the era name, the name TP's external system is registered under, and
optionally the roster's players seen only in match snapshots, and optionally
`deferSppTotal`: when true the players' `spp_total` is left alone, because the
caller writes it afterwards through `players.syncReportedSppAdjustments` (the
bulk importer does). The live import does not defer: it stores TP's raw total
and, in a match or competition import, overwrites it in-process with the
settled total once the match events are in. A live team import on its own
leaves TP's raw total in place, so re-importing a bulk-imported player's team
that way rewrites `spp_total` (raw, then settled again by the next match,
competition or bulk import), adding history rows each way.
Output: the `team` and `players` results, plus the team's team eras, each
imported player's `lineUpId` → player id (and whether it was inserted) and the
career SPP total TP reports for it. The bulk importer's later steps resolve
teams and players by these. See
[import-tp's architecture](../import-tp/index.md#architecture) for how the
bulk run uses it. In the same call it writes each roster player's own
skills, named from the skill masters the roster file embeds.

## Failures

Every import problem is one `ImportError` in the result — with one exception for the live imports: when TP blocks
requests (a 403, see [scrape-tp](../scrape-tp/index.md#what-a-request-does)),
`TpBlockedError` is thrown out of the entry point at once. Every further
request would fail the same way, so no further team, match or rules set is
attempted and nothing about the block is reported per stage. The error is
re-exported from this package for callers to catch; its `retryAt` says when
TP is next contacted. When the block interrupts a competition's backfill in
a live match or competition import (see
[match-import.md](match-import.md) and
[competition-import.md](competition-import.md)), its `backfillInterrupted`
is set to true before it is thrown: the competition now exists, so a caller
retrying the import passes `forceMatchBackfill` to complete the backfill
rather than skip it. A block met before the backfill leaves it unset. The
other failures:

| Failure                                                                                                 | Reported in                                          |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| TP request fails (network error, TP rate-limiting it; a 403 block throws instead, see above); live only | `team`, naming the roster id                         |
| Roster does not parse                                                                                   | `team`                                               |
| Race unresolvable, no ongoing era, or several ongoing eras; live only                                   | `team`, naming the race and the eras found           |
| Explicitly passed era does not exist; live only                                                         | `team`, naming the era                               |
| Era not in the database                                                                                 | `team`, naming the era and roster                    |
| Era declares no single rules set                                                                        | `team`; the import continues without characteristics |
| External systems cannot be set up                                                                       | `team`                                               |
| Race unresolvable, coach or team upsert failure                                                         | `team`                                               |
| Position unresolvable, player upsert failure                                                            | `players`                                            |
| Skill id neither named by the roster nor carried by a skill; live only                                  | `players`, once per id                               |
| Hatred/Animosity keyword code not curated; live only                                                    | `players`, once per skill and code                   |
| Skill upsert, skill lookup, keyword catalogue read or player-skill write                                | `players`                                            |

When the team is not imported, its players are not attempted and `players`
reports nothing imported.

A skill gap never fails a player or the team: the skill is left out, the
player is still imported, and `players.imported` still counts it.

## Dependencies

It calls [game-data](../game-data/index.md) in-process and never reaches the
api-server over RPC, so `apps/discord-bot` can call it directly while
`tools/import-tp` reaches it only through the `tp*.import` procedures. For the
same reason it deliberately depends on neither [import](../import/index.md)
nor [api-client](../api-client/index.md): the import rules it must apply
exactly like the bulk importers come from
[import-shared](../import-shared/index.md). It fetches through
[scrape-tp](../scrape-tp/index.md), builds its requests with
[tp-paths](../tp-paths/index.md) and parses with
[parse-tp](../parse-tp/index.md).

## Wiring it into an app

The package reads no config of its own. `TpRosterModule`, `TpMatchModule`
and `TpCompetitionModule` all need `packages/db`'s `DB`, which the app's
`DbModule` provides.
`ImportTpLiveModule` also needs `TP_CONNECTION_PROVIDER`, provided from a
`@Global()` module: `getBackendApiUrl()` and `getFrontendBaseUrl()`, TP's base
URLs with trailing slashes included. `apps/discord-bot` provides it from its
`TpConnectionModule`, built from its `TP_FRONTEND_BASE_URL` and
`TP_BACKEND_API_URL` settings. The bot's mandatory `TP_SCRAPING_ENABLED`
setting decides whether its `/importtp` command and TP notification feed call
these entry points at all; the package itself knows nothing about it.

## Development

```bash
pnpm --filter @blood-bowl-tracker/import-tp-live run test        # unit tests with coverage
pnpm --filter @blood-bowl-tracker/import-tp-live run test:watch  # unit tests in watch mode
pnpm --filter @blood-bowl-tracker/import-tp-live run verify      # build + lint + typecheck + format + test
```
