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
  game-data/          — DB-backed business logic for core game entities
                        (coaches, external systems); depends on packages/db
                        only, no network dependency; usable directly by any app
  api-contract/       — oRPC contract defining coaches.upsert and
                        externalSystems.upsert; imported by both api-server
                        and api-client
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
history companion, and all three of its triggers (a `reject_no_op_update()` guard, the temporal-tables `versioning()`
trigger, and a `set_updated_at()` trigger) together. A completeness spec
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

Each tracked table also carries a `"0_<table>_reject_no_op_update"` trigger
running the generic `reject_no_op_update()` function
(`packages/db/sql/reject_no_op_update_function.sql`). It is a `BEFORE UPDATE`
trigger that returns `NULL` when `NEW IS NOT DISTINCT FROM OLD`, cancelling
the row's update entirely so no subsequent trigger fires; otherwise it
returns `NEW` and the update proceeds. Without it, an upsert of an unchanged
row would still bump `updated_at` and write a new history row: Postgres fires
same-timing triggers in alphabetical trigger-name order, so `set_updated_at`
would mutate `NEW.updated_at` before `versioning()`'s own no-op guard
(`IF NEW IS NOT DISTINCT FROM OLD THEN RETURN OLD`) could ever see an
unchanged row. The `0_` name prefix sorts this trigger ahead of both
`<table>_set_updated_at` and `<table>_versioning` regardless of table name,
so it runs first — before anything has mutated `NEW` — making its
`NEW`-vs-`OLD` comparison a true "did the data actually change" check. The
leading digit is why the trigger name is double-quoted. The 29 tables that
predate this trigger were retrofitted by the
`20260717130000_add_reject_no_op_update_triggers` migration; new tables get
it automatically via `db:generate`.

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
