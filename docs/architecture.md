# Architecture

Overview of the technical stack and package structure for this project.

## Technology choices

- **Runtime:** Node.js with TypeScript across all packages and apps
- **Application framework:** NestJS 11 on Express
- **Database:** PostgreSQL, accessed via Drizzle ORM (v1.0, currently pre-release)
- **API contract:** [oRPC](https://orpc.dev/) — a typed contract shared between server and client, dispatched over oRPC's native RPC transport (not REST/OpenAPI), enforced at compile time
- **Testing:** Vitest
- **Package manager:** pnpm 11 with workspaces
- **Deployment:** Docker, with a root `compose.yaml` for local development

## Repository structure

```
apps/
  discord-bot/        — NestJS Discord bot; currently the only deployed app;
                        hosts packages/api-server's /rpc endpoint in-process

packages/
  db/                 — Drizzle schema + migrations; the only package that
                        imports directly from the database driver
  game-data/          — DB-backed business logic for core game entities;
                        depends on packages/db and on packages/api-contract
                        for shared contract types (Upsert* shapes, ActionType,
                        ConsequenceType); no network dependency; usable
                        directly by any app
  api-contract/       — oRPC contract plus the Zod schemas and inferred
                        Upsert* types for all game entities; the single source
                        of truth for those shapes, consumed by api-server,
                        api-client, game-data, and import
  api-server/         — Thin NestJS transport layer: mounts a single oRPC
                        RPCHandler at /rpc, dispatching into packages/game-data;
                        hosted in-process by apps/discord-bot (there is no
                        separate deployed api-server process)
  api-client/         — NestJS module wrapping an oRPC RPCLink client for
                        calling a deployed api-server's /rpc endpoint; owns
                        its own @nestjs/config-backed base URL configuration
  import/             — NestJS module with import orchestration logic:
                        generic upsert-bookkeeping (ImportRunnerService) plus
                        entity-specific services (CoachesImportService,
                        ExternalSystemsImportService) that call api-client

tools/
  import-<source>/    — one NestJS CLI application per upstream data source; uses
                        packages/import to call a deployed api-server instance
  import-manual/      — NestJS CLI application for hand-authored supplementary
                        data (leagues, eras, rules sets, races, positions,
                        coaches, teams, and extra external IDs); run before and
                        after the system-specific importers; uses packages/import
  review-match/       — NestJS CLI application that reads game data directly via
                        packages/db and renders raw source data side by side with
                        imported match events as a static HTML report; a
                        developer review aid, not part of any import path
```

## Data flow

- `apps/discord-bot` imports `packages/api-server` (to host the `/rpc` endpoint) and can import `packages/game-data` directly for any in-process feature that needs coach/external-system data, without a network hop
- `tools/import-*` import `packages/import`, which internally calls `packages/api-client` to reach a deployed `api-server` over the network
- `packages/api-server` imports `packages/game-data` (for persistence) and `packages/api-contract` (for the RPC contract it implements) — it has no dependency on `packages/db` directly
- `packages/game-data` has no dependency on any network-facing package — it is pure business logic over `packages/db`

## Key decisions

**Drizzle in its own package.** The pre-release Drizzle dependency is isolated to `packages/db`, so the risk of breaking changes is contained to one place.

**oRPC over ts-rest.** ts-rest's development had stalled — its only zod 4-compatible release was an unpromoted release candidate over a year old — which was blocking a needed zod upgrade. oRPC is actively maintained and supports zod 4.

**RPC transport over REST/OpenAPI.** oRPC supports both; REST/OpenAPI modeling (HTTP verbs, per-route status codes, path design) was evaluated first and found to add real friction for zero benefit, since every consumer of this API is TypeScript within this monorepo and there's no plan for external or non-TypeScript consumers. Plain RPC dispatch removes that overhead entirely.

**game-data as its own package, separate from api-server.** Business logic needs to be usable by any app directly (in-process, no network hop) without pulling in the network-transport layer. Splitting them also made it easy to delete the 14 API resources that had zero callers anywhere (HTTP or direct injection) without touching business logic for the 2 resources that are actually used.

**api-server as a package, not an app.** The Discord bot is the only deployment target, so the RPC dispatch layer lives in a package it hosts in-process via NestJS module composition, rather than a separately deployed service.

**One import tool per source.** Importing data from different upstream applications requires different extraction and transformation logic. Separate tools keep each integration self-contained, sharing common upsert/client-wrapping logic via `packages/import`.

## Testing

Unit tests run under Vitest as `*.spec.ts` files alongside the code they cover,
with a 90% coverage threshold (lines, functions, branches, statements) enforced
per workspace.

Reusable test-only helpers — data builders and shared mock/assertion utilities —
live in `*.test-helpers.ts` modules co-located with the specs that use them.
These files:

- are **test-only** and must **never be imported by production code**;
- are excluded from coverage (each workspace's `vitest.config.ts` lists
  `'src/**/*.test-helpers.ts'` in `coverage.exclude`, exactly as it does for
  `*.spec.ts`), so helper code does not distort the production coverage gate;
- are still ordinary modules — test discovery is unaffected, which stays
  `include: ['src/**/*.spec.ts']`.

Helpers live in the workspace that uses them. A helper is promoted to a shared
package only if the same helper is genuinely needed in two or more workspaces.

## Database

### Migrations

Migration SQL files live in `packages/db/migrations/` and are generated by drizzle-kit:

```bash
cd packages/db
pnpm run db:generate   # generates a new migration from schema changes
```

Always review the generated SQL before committing. Drizzle-kit may generate `DROP + ADD` for a rename — rewrite these as `ALTER TABLE ... RENAME COLUMN` / `ALTER TABLE ... RENAME TO` to preserve existing data.

Migrations are applied automatically at application startup. `createDb` in `packages/db` calls `drizzle-orm`'s `migrate()` before returning the database instance, so every deployment applies any pending migrations before the app begins handling requests. Migrations are roll-forward only; there is no rollback mechanism.

### History tracking

Every table in `packages/db/src/schema` is built with `historyTrackedTable()`
(`packages/db/src/schema/history.ts`), not a direct `<schema>.table(...)`
call. It automatically adds `created_at`, `updated_at`, `history_version`,
and `history_period` columns, derives a companion `<table>_history` table
that mirrors the tracked table's _current_ columns (name, type, and
nullability), and registers the table so `pnpm run db:generate` can finish
its DDL automatically.

Adding a new table therefore only requires calling `historyTrackedTable()`
instead of `gameData.table()` (or another schema's `.table()`) — running
`pnpm run db:generate` once produces a single migration with the table, its
history companion, and both its triggers (the temporal-tables `versioning()`
trigger and a `set_updated_at()` trigger) together. A completeness spec
(`packages/db/src/schema/history-completeness.spec.ts`) fails CI if a table
is ever added without going through `historyTrackedTable()`.

`db:generate` post-processes the generated `migration.sql` for history
tables: a brand-new `<table>_history` is created with
`CREATE TABLE (LIKE "<schema>"."<table>")` (copying columns/types/NOT NULL
but not the tracked table's PK, FKs, defaults, or identity), and its
primary key `(id, history_version)` plus a deferrable self-referencing FK
back to the tracked table are appended directly. When a tracked column is
removed, the corresponding history-table `DROP COLUMN` is rewritten to
`ALTER COLUMN ... DROP NOT NULL`, so the column survives as nullable and
old history rows are preserved. Only future migrations are affected;
existing migrations are never rewritten.

Postgres fires same-timing triggers on a table in alphabetical trigger-name
order, so `<table>_set_updated_at` always fires before `<table>_versioning`
(`s` < `v`) — this ordering is required, not incidental, and the trigger
names are deliberately left unprefixed to keep it. `set_updated_at()`
(`packages/db/sql/set_updated_at_function.sql`, not vendored) is
conditional: it skips the `updated_at` bump when `NEW IS NOT DISTINCT FROM
OLD`. Because it fires first, before anything else has touched the row,
that comparison is a true "did the caller's `UPDATE` actually change
anything" check — it bumps `updated_at` only on a real change, and leaves
it untouched on a genuine no-op upsert.

`versioning()` then fires second and sees the row exactly as it will be
written: for a no-op, `NEW` is still identical to `OLD` in every column
(including `updated_at`), so its own built-in no-op guard
(`IF NEW IS NOT DISTINCT FROM OLD THEN RETURN OLD`) correctly skips writing
a history row; for a real change, `updated_at` has already been bumped, so
the history row `versioning()` inserts for the new "current version" (it
inserts using `NEW`) correctly captures the fresh timestamp rather than a
stale one. Both triggers always return `NEW`/`OLD`, never `NULL`, so
`UPDATE ... RETURNING` always returns the row, no-op or not — important
because `packages/game-data`'s upsert methods rely on getting a row back
from `RETURNING` on every upsert.

Reversing this order (making `versioning()` fire first, e.g. via a `0_`
name prefix) was tried and rejected: `versioning()`'s history `INSERT` uses
`NEW` at the moment it runs, which would then be *before*
`set_updated_at()` had bumped anything, so a genuine update's new history
row would capture the row's *previous* `updated_at` instead of its current
one — confirmed via manual testing. The 29 tables that predate this fix
only needed `set_updated_at()` replaced (`CREATE OR REPLACE FUNCTION` is
safe to re-run everywhere), via the
`20260717130000_make_set_updated_at_conditional` migration; their trigger
names and firing order were already correct.

The `versioning()` trigger function is vendored unmodified from
[nearform/temporal_tables](https://github.com/nearform/temporal_tables) at
`packages/db/vendor/nearform/temporal_tables/versioning_function.sql`, checksum-
tested to catch accidental edits. Upgrading it means replacing the vendor
file, updating the checksum test's recorded hash in the same commit, and
generating a new migration that copies the updated file's content verbatim
(the function uses `CREATE OR REPLACE`, so this is safe to re-run in any
environment, including production). Vendored components (currently just
this one) are tracked in `packages/db/vendor/vendored_software.md`.

Because history rows are written on insert (not only from the first
update onward), every tracked row has a referencing history row from the
moment it's created — so deleting a tracked row is always blocked, not
just rows that have accumulated history. This is intentional and
permanent: there is no supported way to hard-delete a tracked row.

## Discord bot user-facing messages

Every error or status message the Discord bot can send to a user lives in
`apps/discord-bot/src/error-messages.ts` as a named `SCREAMING_SNAKE_CASE`
string constant.

- **One constant per call site.** Each constant is referenced from exactly one
  place in production code — or, for a fact backed by a shared helper (e.g.
  `resolveToplist` in `insights/leaderboard.ts`), from every call site within
  that one originating fact, since the helper takes the message as a
  parameter rather than hardcoding it. When a user reports a message,
  searching the codebase for that exact text points to the single code path
  (or single fact) that produced it.
- **In-universe, never technical.** Message text is deliberately lighthearted
  and Blood Bowl-flavored (apothecaries, referees, coaching staff, historians,
  …). It never describes the underlying failure (a database timeout, a missing
  row) in technical terms.
- **Out of scope.** Internal-only log/console output, startup/config-validation
  errors thrown before the bot can reply, and embed _titles_ for successful
  results are not messages of this kind and stay where they are.

## Docker

Each app in `apps/` has its own `Dockerfile`. The root `compose.yaml` defines services for PostgreSQL and each app, enabling a full local environment with a single `docker compose up`.
