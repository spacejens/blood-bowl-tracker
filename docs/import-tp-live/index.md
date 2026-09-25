# import-tp-live

`packages/import-tp-live` imports one TP team, one completed TP match with
its teams and competition, one TP competition with its registered teams and
trophy awards, or TP's official team list for every rules set, straight into
the database. It is server-side code: it calls `packages/game-data`
in-process and never goes over RPC. Four live entry points and four RPC
procedures use it:

- **The live team import**, `TpLiveTeamImportService.importTeam(...)`, which
  fetches a roster from TP's API first. `apps/discord-bot`'s
  [`/importtp`](../discord-bot/slash-commands/import-tp.md) calls it, and
  the three other live entry points below, in-process.
- **The live match import**, `TpLiveMatchImportService.importMatch(...)` —
  see [match-import.md](match-import.md).
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

- **Live fetch**: `TpRosterFetchService` requests a roster through
  `packages/scrape-tp`, building the request from `packages/tp-paths`'
  `TpRosterPathsService`, and parses it with `packages/parse-tp`'s
  `RosterParserService`.
- **Era resolution**: `TpEraResolutionService` (see below).
- **Roster import**: `TpRosterImportService`, in `TpRosterModule`. It
  resolves the TP and Name external systems, the era and the era's rules
  set, upserts the team, then upserts its players.
- **The live team entry point**: `TpLiveTeamImportService.importTeam(...)`,
  in `ImportTpLiveModule`.
- **Match import**: `TpMatchModule`, with `TpMatchImportService` and its
  match-context, upsert, events and outcome services, plus
  `TpLiveMatchImportService` and its match/bracket fetch services — see
  [match-import.md](match-import.md).
- **Competition import**: `TpCompetitionModule`, with
  `TpCompetitionImportService` and its upsert, participant and trophy-award
  services (the upsert is shared with the live match import), plus
  `TpLiveCompetitionImportService` and its inscriptions/awards fetch
  services — see [competition-import.md](competition-import.md).
- **Official team list import**: `TpOfficialTeamsModule`, with
  `TpOfficialTeamsImportService` and its context, race, position,
  characteristics, keyword and starting-skill services, plus
  `TpLiveOfficialTeamsImportService` and `TpOfficialTeamsFetchService` — see
  [official-teams-import.md](official-teams-import.md).

## Importing a team live

```ts
const { team, players } = await tpLiveTeamImportService.importTeam({
  rosterId: 163386,
  externalSystemName: 'TP',
});
```

- `rosterId`: TP's roster id, the number in the team's roster page URL.
- `era`: optional. The era to import the team under, by name. If left out,
  it is resolved automatically.
- `externalSystemName`: required. The name TP's external system is
  registered under. Pass the same name the bulk import (`tools/import-tp`)
  is configured with, so the live import finds what the bulk import
  registered.
- `session`: optional. A `packages/scrape-tp` session to fetch through. A
  caller importing several teams in one go should pass one session, so their
  requests are paced as one visit. If left out, the import starts its own.

The result carries two `ImportResult`s: `team` (the team upsert, plus any
failure before it) and `players`.

A team needs no competition. It is a complete entity on its own, and TP's
roster data carries no competition either. See [match-import.md](match-import.md)
for how a live match import ties a team and a competition together.

What must already be in the database:

- the team's race (by its TP race code);
- its coach (by TP coach id);
- the era, with the rules set it declares;
- the positions its players play (by TP `lineUpMasterId`).

A missing race or coach skips the team, and a missing position skips that
player. Each is reported as an error. A live import always skips a team whose
coach cannot be resolved: TP's roster carries only its internal coach id,
never a coach name, and there is no live coach import. So a brand-new team
whose coach was never imported before (by `tools/import-tp` or
`tools/import-bbl`) fails with a "could not resolve coach" error.

A live import brings in the roster's current state only. It has no match
data, so it adds no departed players seen only in match snapshots and no
star players hired through inducements — unless the caller passes the
match's roster snapshot, which is what a live match import does for each of
its two teams (see [match-import.md](match-import.md)) so a player who has
since left the roster still exists to be referenced by the match's events.
It does send characteristics, lasting injuries and characteristic-increase
counts, validated against the rules set the era declares.

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
`externalSystemName` its caller passes; there is no default. A caller keeps
it in sync with the name `tools/import-tp` is configured with.

## The `tpRosters.import` procedure

Input: the roster JSON exactly as TP's API returns it (parsed server-side),
the era name, the name TP's external system is registered under, and
optionally the roster's players seen only in match snapshots. Output: the
`team` and `players` results, plus the team's team eras, each imported
player's `lineUpId` → player id (and whether it was inserted), and the
mercenary hires' position usages. The bulk importer's later steps resolve
teams and players by these. See
[import-tp's architecture](../import-tp/index.md#architecture) for how the
bulk run uses it.

## Failures

Neither entry point throws for an import problem. Each is one `ImportError`
in the result:

| Failure                                                                      | Reported in                                          |
| ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| TP request fails (network error, TP refusing or rate-limiting it); live only | `team`, naming the roster id                         |
| Roster does not parse                                                        | `team`                                               |
| Race unresolvable, no ongoing era, or several ongoing eras; live only        | `team`, naming the race and the eras found           |
| Explicitly passed era does not exist; live only                              | `team`, naming the era                               |
| Era not in the database                                                      | `team`, naming the era and roster                    |
| Era declares no single rules set                                             | `team`; the import continues without characteristics |
| External systems cannot be set up                                            | `team`                                               |
| Race or coach unresolvable, team upsert failure                              | `team`                                               |
| Position unresolvable, player upsert failure                                 | `players`                                            |

When the team is not imported, its players are not attempted and `players`
reports nothing imported.

## Wiring it into an app

The package reads no config of its own. `TpRosterModule`, `TpMatchModule`
and `TpCompetitionModule` all need `packages/db`'s `DB`, which the app's
`DbModule` provides.
`ImportTpLiveModule` also needs `TP_CONNECTION_PROVIDER`, provided from a
`@Global()` module: `getBackendApiUrl()` and `getFrontendUrl()`, TP's base
URLs with trailing slashes included. `apps/discord-bot` provides it from its
`TpConnectionModule`, built from its `TP_FRONTEND_BASE_URL` and
`TP_BACKEND_API_URL` settings.

## Development

```bash
pnpm --filter @blood-bowl-tracker/import-tp-live run test        # unit tests with coverage
pnpm --filter @blood-bowl-tracker/import-tp-live run test:watch  # unit tests in watch mode
pnpm --filter @blood-bowl-tracker/import-tp-live run verify      # build + lint + typecheck + format + test
```
