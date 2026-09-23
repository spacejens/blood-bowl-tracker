# import-tp-live

`packages/import-tp-live` imports one TP team, and its players, straight from
TP's live API — no local download needed. It is the building block the
on-demand TP imports are made of: importing a match or a competition live
pulls in each participating team through it. It also holds the team and
player import logic `tools/import-tp`'s bulk run uses, so a bulk import and a
live one import a team the same way.

## What it owns

- **Roster paths** — `TpRosterPathsService`: TP's API path for a roster
  (`rosters/<id>`) and the frontend page it is shown on (`roster/<id>`, sent
  as the request's referer). `tools/download-tp` builds its roster requests
  from the same service.
- **Live fetch** — `TpRosterFetchService`: requests a roster through
  `packages/scrape-tp` and parses it with `packages/parse-tp`'s
  `RosterParserService`.
- **Era resolution** — `TpEraResolutionService` (see below).
- **Team and player import** — `TpTeamsImportService`,
  `TpPlayersImportService` and the services they delegate to, in
  `TpRosterImportModule`. `tools/import-tp` runs its bulk import on these;
  see [import-tp's architecture](../import-tp/index.md#architecture) for what
  they do.
- **The entry point** — `TpLiveTeamImportService.importTeam(...)`, in
  `ImportTpLiveModule`.

## Importing a team

```ts
const { team, players } = await tpLiveTeamImportService.importTeam({
  rosterId: 163386,
});
```

- `rosterId` — TP's roster id: the number in the team's roster page URL.
- `era` — optional. The era to import the team under, by name. Left out, it
  is resolved automatically.
- `session` — optional. A `packages/scrape-tp` session to fetch through. A
  caller importing several teams in one go should pass one session, so their
  requests are paced as one visit; left out, the import starts its own.

The result carries two `ImportResult`s: `team` (the team upsert, plus any
failure before it) and `players`.

A team needs no competition. It is a complete entity on its own, and TP's
roster data carries no competition either; importing a match or a
competition live is what later ties a team to it.

What must already be in the database: the team's race (by its TP race code),
its coach (by TP coach id), the era, and the positions its players play (by
TP `lineUpMasterId`). A missing race or coach skips the team; a missing
position skips that player. Each is reported as an error.

A live import always skips a team whose coach cannot be resolved: `TpRoster`
carries only TP's internal coach id, never a coach name, and there is no live
coach-import capability, so the team upsert cannot create a coach on the fly.
In practice this means a brand-new team whose coach has never been imported
before (via `tools/import-tp`'s bulk run or `tools/import-bbl`) fails to
import live with a "could not resolve coach" error.

A live import brings in the roster's current state only. Unlike a bulk run it
has no match data, so it adds no departed players seen only in match
snapshots and no star players hired through inducements, and it sends no
characteristic reduction or increase counts, which need the rules sets a bulk
run's rules-sets step supplies.

## Era resolution

TP's roster names no era. An era passed explicitly is used as given. Otherwise
the team's race is looked up by its TP race code, and the race's ongoing eras
— eras it is linked to with no end date, via the read-only
`races.listOngoingEras` procedure — decide it:

- exactly one — that era is used;
- none — the team is not imported;
- several — the team is not imported, and the caller must name the era. This
  is a normal case, not a rare one: a Dungeon Bowl era commonly runs
  alongside a normal era.

## Failures

`importTeam` never throws for an import problem; each is one `ImportError` in
the result:

| Failure | Reported in |
| --- | --- |
| TP request fails (network error, TP refusing or rate-limiting it) | `team`, naming the roster id |
| Response does not parse as a roster | `team`, naming the roster id |
| Race unresolvable, no ongoing era, or several ongoing eras | `team`, naming the race and the eras found |
| Team or player upsert failure | `team` / `players`, as in a bulk run |

When the team is not imported, its players are not attempted and `players`
reports nothing imported.

## Wiring it into an app

The package reads no config of its own. The importing app provides three DI
tokens from a `@Global()` module, plus `@blood-bowl-tracker/api-client`'s
`ApiClientModule` (every upsert goes through the api-server):

| Token | Shape | Needed by |
| --- | --- | --- |
| `TP_CONNECTION_PROVIDER` | `getBackendApiUrl()`, `getFrontendUrl()` — TP's base URLs, trailing slash included | `ImportTpLiveModule` only |
| `TP_EXTERNAL_SYSTEM_NAME_PROVIDER` | `getTpSystemName()` | both modules |
| `TP_ERA_RULES_SETS_PROVIDER` | `getEras()` — each era's name and declared rules sets | both modules |

A live caller imports `ImportTpLiveModule`. `tools/import-tp` imports only
`TpRosterImportModule` — it needs the upserts but never fetches from TP — and
provides the two tokens that module needs from its own config services with
`useExisting` (`tools/import-tp/src/source/tp-roster-import-providers.module.ts`).

## Development

```bash
pnpm --filter @blood-bowl-tracker/import-tp-live run test        # unit tests with coverage
pnpm --filter @blood-bowl-tracker/import-tp-live run test:watch  # unit tests in watch mode
pnpm --filter @blood-bowl-tracker/import-tp-live run verify      # build + lint + typecheck + format + test
```
