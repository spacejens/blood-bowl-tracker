# Architecture

Overview of the technical stack and package structure for this project.

## Technology choices

- **Runtime:** Node.js with TypeScript across all packages and apps
- **Application framework:** NestJS 11 on Express
- **Database:** PostgreSQL, accessed via Drizzle ORM (v1.0, currently pre-release)
- **API contract:** [oRPC](https://orpc.dev/) — a typed contract shared between server and client, dispatched over oRPC's native RPC transport (not REST/OpenAPI), enforced at compile time
- **Testing:** Vitest
- **Package manager:** pnpm 11 with workspaces
- **Deployment:** Docker, with a root `docker-compose.yml` for local development and on Fly.io + Neon in production (see `docs/discord-bot/production-hosting.md`)

## Repository structure

```text
apps/
  discord-bot/        — NestJS Discord bot; currently the only deployed app;
                        hosts packages/api-server's /rpc endpoint in-process

packages/
  db/                 — Drizzle schema + migrations; the only package that
                        imports directly from the database driver
  domain-enums/       — single source of truth for every Blood Bowl domain
                        enum's member list, as plain as-const string arrays;
                        deliberately depends on no other workspace package so
                        packages/db and packages/api-contract can each build
                        from it while staying mutually independent
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
                        separate deployed api-server process); /rpc requires a
                        bearer token per importer tool, see
                        docs/api/rpc-conventions.md
  api-client/         — NestJS module wrapping an oRPC RPCLink client for
                        calling a deployed api-server's /rpc endpoint; owns
                        its own @nestjs/config-backed base URL configuration
  config-loader/      — library package with the generic JSON5 config-file
                        loading shared by the import tools (through
                        packages/import) and tools/download-tp: read the file,
                        treat a missing file as an empty config, parse JSON5
                        with an error naming the path, and validate against a
                        caller-supplied top-level schema
  discord-bot-usage/  — NestJS module recording Discord bot usage into the
                        discord_bot_usage schema: one row per triggered slash
                        command, button click or select-menu selection, with
                        the guild, channel, user and parameters behind it.
                        Depends on packages/db; consumed by
                        packages/discord-client (writes) and
                        apps/discord-bot (reads)
  discord-client/     — NestJS module wrapping discord.js for connecting to
                        Discord, registering slash commands, and posting
                        messages; records every handled interaction through
                        packages/discord-bot-usage; consumed by
                        apps/discord-bot
  import/             — NestJS module with import orchestration logic:
                        generic upsert bookkeeping (ImportRunnerService,
                        BatchBufferService, ExternalIdResolverService) plus
                        roughly 18 entity-specific import services (coaches,
                        teams, players, matches, trophies, and so on) that
                        call api-client; also owns the config-service factories the import
                        tools' own config, external-system-name and source
                        services are built from
  import-tp-live/     — server-side NestJS module importing one TP roster or
                        one completed TP match, with its teams and
                        competition, or one rules set's official team list,
                        through packages/game-data: the core behind
                        tpRosters/tpMatches/tpCompetitions/tpOfficialTeams.import and live entry points
  parse-tp/           — library package for reusable TP JSON-parsing logic
                        (matches, rosters, awards, tournaments); consumed
                        by tools/import-tp and packages/import-tp-live
  read-bbl-mirror/    — library package with the mechanical half of reading
                        BBL's wget mirror: safe filename resolution against a
                        caller-supplied data directory, missing files and
                        directories reported as null/empty, ISO-8859-1 byte
                        decoding, and plain file listing; no BBL page-type
                        awareness or HTML parsing, and no dependency on any
                        other workspace package
  review-harness/     — NestJS module with the domain-agnostic half of the
                        review tools: the review-run orchestration
                        (ReviewServiceBase) and report document shell
                        (ReportBuilderBase), HTML fragment assembly,
                        timestamped report writing, JSON5 config loading,
                        external-system id lookup, characteristic formatting,
                        and the plug-in interfaces + DI wiring each data-type
                        module registers through; carries no BBL/TP parsing or
                        interpretation logic
  scrape-tp/          — NestJS module with the one implementation of fetching
                        TP's API over plain HTTP: browser-like headers and
                        per-visit sessions with a cookie jar and randomized
                        pacing; no TP URL knowledge, no config, and no
                        dependency on any other workspace package; consumed by
                        tools/download-tp and packages/import-tp-live
  tp-paths/           — TP's roster/tournament/match paths as TP's frontend
                        requests them; pure, no I/O, shared by tools/download-tp and import-tp-live

tools/
  download-tp/        — NestJS CLI application that fetches TP's API over
                        plain HTTP via packages/scrape-tp and records the
                        responses as local JSON files for later import by
                        tools/import-tp
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
  review-player/      — NestJS CLI application that renders raw BBL and TP
                        source data beside imported player records (identity,
                        team, position, era) and star player point totals as a
                        static HTML report; sibling of review-match, likewise a
                        developer review aid
  review-race/        — NestJS CLI application that renders raw BBL, TP and
                        hand-curated source data beside imported races,
                        position availability and per-rules-set position
                        characteristics as a static HTML report; sibling of
                        review-match and review-player, likewise a developer
                        review aid
  review-star-player/ — NestJS CLI application that renders raw BBL, TP and
                        hand-curated source data beside imported star player
                        identity, per-rules-set characteristics and hire
                        eligibility as a static HTML report; sibling of the
                        other three review tools, likewise a developer review
                        aid
  db-diagram/         — shell script (db-diagram.sh, not an npm workspace
                        package) that generates a SchemaSpy ER diagram and
                        browsable schema docs for the local docker-compose
                        database
  eslint-rules/       — custom ESLint rules shared across the repo (currently
                        max-function-params, no-direct-service-instantiation,
                        and no-test-helper-imports), imported directly by the
                        root eslint.config.ts
  markdownlint-rules/ — custom markdownlint rules shared across the repo
                        (currently max-file-lines), built to dist/ and loaded
                        by the root .markdownlint-cli2.jsonc
  cli-shared/         — library package with the plumbing the three CLI
                        packages below share: git main-checkout/worktree
                        resolution, child-process running and spawning, the
                        canonical gitignored file/directory lists, and the
                        shared runCli subcommand-dispatcher driver all three
                        entrypoints run on; no CLI entry point of its own
  dev-workflow-cli/   — NestJS CLI application providing the developer/PR
                        workflow helpers the Claude Code skills in
                        .claude/skills/ call instead of hand-rolling the
                        equivalent shell
  production-ops-cli/ — NestJS CLI application providing the production
                        database and tunnel operations deploy-production
                        invokes
  fs-utils-cli/       — NestJS CLI application providing the worktree-aware
                        filesystem helpers (gitignored-config sync, writing a
                        file through the docs/plans symlink) the Claude Code
                        skills call
```

## Data flow

- `apps/discord-bot` imports `packages/api-server` (to host the `/rpc` endpoint) and can import `packages/game-data` directly for any in-process feature that needs coach/external-system data, without a network hop
- `tools/import-*` import `packages/import`, which internally calls `packages/api-client` to reach a deployed `api-server` over the network
- `packages/api-server` also imports `packages/import-tp-live` to implement `tpRosters.import`, `tpMatches.import`, `tpCompetitions.import` and `tpOfficialTeams.import`; `packages/import-tp-live` calls `packages/game-data` in-process and never reaches the api-server over RPC, so `apps/discord-bot` can call it directly while `tools/import-tp` reaches it only through those four procedures
- `packages/api-server` imports `packages/game-data` (for persistence) and `packages/api-contract` (for the RPC contract it implements) — it has no dependency on `packages/db` directly
- `packages/game-data` has no dependency on any network-facing package — it is pure business logic over `packages/db`

## Client/server boundary

Which side of the API each kind of workspace sits on. Unlike "Data flow" above, which describes today's actual import graph, this is the rule new code must keep to.

- `apps/` are server-side (currently only `apps/discord-bot`); they call server-side packages like `packages/game-data` in-process and must never be forced to call themselves through the API
- `tools/` are client-side; a tool that needs server-side logic goes through `packages/api-client` over the network rather than importing a server-side package (`packages/game-data`, `packages/db`, `packages/api-server`) directly. The `tools/review-*` family (`review-match`, `review-player`, `review-race`, `review-star-player`) is a deliberate exception: they read `packages/db` directly as local-only developer report aids outside the import pipeline, never touching the API
- `packages/` are usually one-sided (client-only or server-only). Deliberate exceptions exist for shared-shape/enum packages designed to serve both sides: `packages/api-contract` (the RPC contract, built on `packages/domain-enums` and external libraries), `packages/domain-enums` (the enum source of truth, with no dependencies of its own), and `packages/tp-paths` (TP file-path computation shared between `packages/import-tp-live` and `tools/download-tp`, also with no dependencies of its own)

## Tool/app relationships

Which tools and apps feed each other along the download → import → consume
pipeline. Use this to judge whether a change in one place needs a matching
change — or opens an opportunity — somewhere else. Only participants in that
pipeline are listed; packages and tools with no role in it (e.g. `packages/db`,
`tools/db-diagram`, `tools/eslint-rules`, `tools/markdownlint-rules`) are omitted.

- **`tools/download-tp`** (downloader) — fetches TP's API via `packages/scrape-tp` into local JSON files; what it records is exactly what `tools/import-tp` can later import, so widening or narrowing the download changes what is importable at all
- **`packages/scrape-tp`** (shared fetching) — the one implementation of how this repo makes HTTP requests TP accepts: the browser-like header set, per-visit sessions with a cookie jar, and randomized pacing between a session's requests. Consumed by `tools/download-tp` and `packages/import-tp-live` (the building block a future `apps/discord-bot` on-demand TP import will use), so a change to how requests look reaches both. It deliberately knows no TP URLs or page-to-endpoint mapping — those stay with each consumer — and depends on no other workspace package
- **`packages/parse-tp`** (shared parsing) — decodes `tools/download-tp`'s JSON; consumed by `tools/import-tp` and `packages/import-tp-live`. It has no BBL counterpart: BBL _interpretation_ (page-type parsing, HTML extraction) stays inside each tool that does it, deliberately, so the review tools can check the importer's reading of a page against their own. Only the mechanical file access is shared, via `packages/read-bbl-mirror`
- **`packages/import-tp-live`** (TP roster and match import, server-side) — imports one TP roster's team and players, one completed TP match with its teams and competition, one competition with its registered teams and trophy awards, or one rules set's official team list, directly through `packages/game-data`: the live imports (fetch via `packages/scrape-tp`, parse via `packages/parse-tp`, era auto-resolution; a live match import creates the competition it needs) and the implementations behind `tpRosters.import`, `tpMatches.import`, `tpCompetitions.import` and `tpOfficialTeams.import`, which `tools/import-tp`'s bulk run calls once per roster file, match file, competition or rules set — so a change to how a TP team, player, match, competition or official team list is imported reaches bulk and live imports together. Deliberately depends on neither `packages/import` nor `packages/api-client` (see `docs/import-tp-live/index.md`)
- **`packages/tp-paths`** (shared TP paths) — TP's roster, tournament and match paths, pure and I/O-free, so the client-only `tools/download-tp` and the server-side `packages/import-tp-live` can both depend on it without either gaining the other's dependencies
- **`packages/read-bbl-mirror`** (shared mirror access) — the mechanics of getting text out of a BBL wget mirror directory: resolving a filename safely against a caller-supplied data directory, reporting a missing file as `null` and a missing directory as an empty listing, decoding bytes as ISO-8859-1, and listing plain files. Consumed by `tools/import-bbl`, `tools/review-match`, `tools/review-player`, `tools/review-race` and `tools/review-star-player`, so a change here reaches all five at once. It carries no BBL-page-type awareness and no HTML parsing on purpose: which files matter, what their names mean and what their contents say stay with each consumer, which is what keeps the review tools' independence from importer logic intact. Like `packages/config-loader`, it deliberately depends on no other workspace package
- **`packages/discord-bot-usage`** (bot telemetry) — records what the bot was asked to do, not what it knows: every matched slash command, button click and select-menu selection lands in the `discord_bot_usage` schema. `packages/discord-client` calls it after each interaction has already been replied to, fire-and-forget, so a recording failure can never affect a user-facing reply. `packages/discord-client` is its only writer. `apps/discord-bot` reads it back through `InteractionEventsQueryService`, for the `/debuginteractions`, `/debugtopusers` and `/debugfilterusage` maintainer commands; broader reporting on the captured data is still separate work
- **`tools/import-bbl`** (importer, BBL source) — sibling of `tools/import-tp`; the same domain data usually exists in both upstream sources, so behavior added to one importer is usually wanted in the other; it reads the mirror's files through `packages/read-bbl-mirror`, while every BBL page-type and HTML interpretation stays in the tool
- **`tools/import-tp`** (importer, TP source) — reads `tools/download-tp`'s files via `packages/parse-tp`; sibling of `tools/import-bbl`, with the same reciprocity; its team, player, competition, match and official team list import go through the `tpRosters.import`, `tpCompetitions.import`, `tpMatches.import` and `tpOfficialTeams.import` procedures, one call per roster file, competition, match file or rules set
- **`tools/import-manual`** (importer, hand-authored data) — runs before and after the source importers and supplies entities they reference (leagues, eras, rules sets, races, positions, coaches, teams, extra external IDs); a new entity kind imported by a source importer often needs matching manual data. It can also supply characteristics a source importer reads back over the API rather than deriving itself — see the gap-fill pattern in `docs/import-manual/index.md`
- **`packages/import`** (shared import orchestration) — used by every `tools/import-*`; a change here reaches all importers at once. It owns:
  - **The shared upsert plumbing** (`createUpsertImportServiceBase`) alongside the runner and batch helpers; for entities with exactly one upsert call, the import service is a declarative subclass supplying only the client resource it upserts through and the wording of its per-item error message, giving it the base class's shared `upsert(data, errors)` method — a subclass may still add its own entity-specific extra method alongside it.
  - **Two kinds of hand-written exception.** Entities with more than one _upsert_ entry point stay hand-written, since the base class's single `upsert` method can't express two upsert entry points; `ExternalSystems` and `SppAwardValues` stay hand-written for a different reason — an underlying resource that isn't shaped like a plain upsert.
  - **A config-object factory rather than `review-harness`'s abstract-class pattern**, because what varies per entity here is only _data_ (which client resource, what error wording), not _behavior_ — a factory taking a config object fits that better than an abstract class with template methods to override.
  - **The same kind of factory for the import tools' config services** — `createImportConfigServiceBase` (connection getters plus the `IMPORT_CONFIG_ENV` production-file swap, over `packages/config-loader`), `createExternalSystemNameConfigServiceBase` and `createSourceConfigServiceBase` — so each tool's config, external-system-name and source-config services are declarative subclasses supplying only their own file name, env var, default system name and DI token.
  - **Not per-entity _parsing_ logic:** the BBL and TP entity import services look similar but genuinely differ in what they extract, so they stay per-tool.
  - **Read calls for contract procedures:** `listCompetitionGroups`, backing `competitionGroups.list`.
- **`packages/config-loader`** (shared config loading) — the source-agnostic JSON5 config-file loading (`createConfigLoaderServiceBase`) behind every import tool's config service (via `packages/import`'s `createImportConfigServiceBase`), `tools/download-tp`'s, and `packages/review-harness`'s (via its own `createReviewConfigServiceBase`, a factory over `createConfigLoaderServiceBase` in the same shape as `packages/import`'s, layering its own review-specific accessors on top). It knows nothing about what a config file contains: each caller supplies its own top-level schema, DI path token and getters, so a change here changes _how_ config files are read for all seven config-reading tools at once; it does not define _what_ any of them accepts — each caller's own domain schema stays with the caller, not this package. It deliberately depends on no other workspace package, keeping the `tools/* → packages/*` direction intact
- **`packages/review-harness`** (shared review scaffolding) — used by every review tool (`tools/review-match`, `tools/review-player`, `tools/review-race`, `tools/review-star-player`); a change here reaches all review tools at once. It owns the review-run orchestration (`ReviewServiceBase`) and the report document shell (`ReportBuilderBase`) alongside two leaf helpers that were duplicated across the tools wherever they existed: `createExternalSystemLookupServiceBase` (the memoized `external_systems.id` lookup, taking each tool's own config service class and config file name), duplicated across all four tools, and `CharacteristicFormatService` with its `CharacteristicFormat` type and none marker (rendering one characteristic in its rules set's display format), duplicated between `review-player` and `review-race` (review-match has no characteristics to format). Each tool's `ReviewService`/`ReportBuilderService` is a thin subclass supplying only what differs, and each tool keeps only a one-line declarative subclass or a plain import for the two leaf helpers. It deliberately carries no BBL/TP parsing or interpretation logic — raw-source parsing, comparison predicates and label tables stay duplicated per tool, see the review-tool entries below
- **`packages/api-contract`** (shared shapes) — newly imported data must exist in the contract before an importer can send it or a consumer can read it; a change here reaches api-server, api-client, game-data, and import together
- **`apps/discord-bot`** (consumer) — reads imported data via `packages/game-data`; data newly landed by any importer is a candidate for a new command, fact, or insight
- **`tools/review-match`** (consumer, review aid) — renders raw BBL and TP source data beside imported match events, so a change to what either importer stores for match events usually needs a matching renderer change here; it deliberately interprets the raw sources itself and must never depend on `packages/parse-tp` or importer logic (the mechanical file access is shared via `packages/read-bbl-mirror`, which carries no interpretation and so does not weaken that rule) (see `docs/review-match/index.md`) — that independence rule covers the domain-specific half only; the generic report scaffolding is shared on purpose via `packages/review-harness`, where its `ReviewService` and `ReportBuilderService` subclass `ReviewServiceBase`/`ReportBuilderBase` and add only the match-result lookup and the per-match section
- **`tools/review-player`** (consumer, review aid) — renders raw BBL and TP source data beside imported player records (identity, team, position, era) and star player point totals, so a change to what either importer stores for players usually needs a matching renderer change here; sibling of `tools/review-match`, structured the same way and deliberately independent of it — it interprets the raw sources itself and must never depend on `packages/game-data`, `packages/parse-tp`, `packages/import`, or either importer (the mechanical file access is shared via `packages/read-bbl-mirror`, which carries no interpretation) (see `docs/review-player/index.md`) — that independence rule covers the domain-specific half only; the generic report scaffolding is shared on purpose via `packages/review-harness`, where its `ReviewService` and `ReportBuilderService` subclass `ReviewServiceBase`/`ReportBuilderBase` and add only the per-player section
- **`tools/review-race`** (consumer, review aid) — renders raw BBL, TP and hand-curated source data beside imported races, `positions_race_eras` and `position_rules_sets`, so a change to what any of the three importers stores for races or positions usually needs a matching renderer change here; sibling of `tools/review-match` and `tools/review-player`, structured the same way — it interprets the raw sources itself and must never depend on `packages/game-data`, `packages/parse-tp`, `packages/import`, `tools/import-bbl`, `tools/import-tp` or `tools/import-manual` (the mechanical file access is shared via `packages/read-bbl-mirror`, which carries no interpretation and so needs no such callout) (see `docs/review-race/index.md`); that independence rule covers the domain-specific half only; the generic report scaffolding is shared on purpose via `packages/review-harness`, where its `ReviewService` and `ReportBuilderService` subclass `ReviewServiceBase`/`ReportBuilderBase` and add only the per-race section — it is the first review tool to treat the hand-curated `tools/import-manual` data as a raw source, which is why `ReviewSource` gained `'manual'`
- **`tools/review-star-player`** (consumer, review aid) — renders raw BBL, TP and hand-curated star data beside imported `positions`, `position_rules_sets` and `positions_race_eras`, so a change to what any of the three importers stores for star players usually needs a matching renderer change here; sibling of `tools/review-match`, `tools/review-player` and `tools/review-race`, structured the same way — it interprets the raw sources itself and must never depend on `packages/game-data`, `packages/parse-tp`, `packages/import`, `tools/import-bbl`, `tools/import-tp`, `tools/import-manual` or `tools/review-race` (the mechanical file access is shared via `packages/read-bbl-mirror`, which carries no interpretation and so needs no such callout) (see `docs/review-star-player/index.md`); that independence rule covers the domain-specific half only; the generic report scaffolding is shared on purpose via `packages/review-harness`. It exists because `tools/review-race` deliberately excludes star players from its per-race panels — a star is not owned by one race, so a per-race report is the wrong place to review it

## Key decisions

**Drizzle in its own package.** The pre-release Drizzle dependency is isolated to `packages/db`, so the risk of breaking changes is contained to one place. Every other workspace builds queries with the operators and types `packages/db` re-exports — and, in specs, the test-only ones on its `/test-helpers` subpath — rather than importing `drizzle-orm` itself. The boundary is enforced by an automated test, not convention alone: `packages/db/src/dependency-boundary.spec.ts` scans every workspace's `package.json` and fails if anything but `packages/db` declares `drizzle-orm` or `postgres`. `AdvisoryLockService` — leader election's session-scoped Postgres advisory lock — lives in `packages/db` for the same driver-isolation reason: it needs its own `postgres.js` connection rather than drizzle's pool, and keeping it here is what lets `apps/discord-bot` declare no driver dependency at all.

**oRPC over ts-rest.** ts-rest's development had stalled — its only zod 4-compatible release was an unpromoted release candidate over a year old — which was blocking a needed zod upgrade. oRPC is actively maintained and supports zod 4.

**RPC transport over REST/OpenAPI.** oRPC supports both; REST/OpenAPI modeling (HTTP verbs, per-route status codes, path design) was evaluated first and found to add real friction for zero benefit, since every consumer of this API is TypeScript within this monorepo and there's no plan for external or non-TypeScript consumers. Plain RPC dispatch removes that overhead entirely.

**game-data as its own package, separate from api-server.** Business logic needs to be usable by any app directly (in-process, no network hop) without pulling in the network-transport layer. Splitting them also made it easy to delete the 14 API resources that had zero callers anywhere (HTTP or direct injection) without touching business logic for the 2 resources that are actually used.

**api-server as a package, not an app.** The Discord bot is the only deployment target, so the RPC dispatch layer lives in a package it hosts in-process via NestJS module composition, rather than a separately deployed service.

**One import tool per source.** Importing data from different upstream applications requires different extraction and transformation logic. Separate tools keep each integration self-contained, sharing common upsert/client-wrapping logic via `packages/import`.

**Client packages stay separate from the business logic that uses them.** `packages/api-client` and `packages/discord-client` hold reusable technical plumbing (API transport, Discord client lifecycle) deliberately kept separate from the business logic built on top of it. `discord-client` has exactly one consumer today, `apps/discord-bot`; `api-client` already has several consumers — `packages/import` and each `tools/import-*` CLI configure it directly. Either way, keeping the transport layer as its own package means no untangling is needed as the set of consumers changes.

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
package only if the same helper is genuinely needed in two or more workspaces —
`mockDb` is one such helper, living in `packages/db` and used by
`packages/game-data`, `tools/review-match`, `tools/review-player`, and
`packages/review-harness`'s own specs. It is reachable as
`@blood-bowl-tracker/db/test-helpers` (a separate export subpath whose compiled
output carries its own `{"type": "module"}` marker, so importing the package's
main entry point never pulls Vitest into a consumer's runtime graph).
`packages/db` is the shared home because it is a package every consumer already
depends on and it carries nothing network-facing, so promoting the helper there
crosses no dependency-direction rule.

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

Every table in `packages/db/src/schema` — both the `game_data` schema
(`packages/db/src/schema/game-data/`) and the `discord_bot_usage` schema
(`packages/db/src/schema/discord-bot-usage/`, see `packages/discord-bot-usage`
below) — is built with `historyTrackedTable()`
(`packages/db/src/schema/history.ts`), not a direct `<schema>.table(...)`
call. It automatically adds `created_at`, `updated_at`, `history_version`,
and `history_period` columns, derives a companion `<table>_history` table
that mirrors the tracked table's _current_ columns (name, type, and
nullability), and registers the table so `pnpm run db:generate` can finish
its DDL automatically.

Adding a new table therefore only requires calling `historyTrackedTable()`
instead of `<schema>.table()` — running `pnpm run db:generate` once produces
a single migration with the table, its history companion, and both its
triggers (the temporal-tables `versioning()` trigger and a
`set_updated_at()` trigger) together. A completeness spec
(`packages/db/src/schema/history-completeness.spec.ts`) fails CI if a table
is ever added without going through `historyTrackedTable()`.

Writing to a history-tracked table must go through a plain `insert` or
`update`, never `INSERT ... ON CONFLICT DO UPDATE`: Postgres fires a
`BEFORE INSERT` row trigger for the attempted row before it even checks for
a conflict, so `versioning()` — which unconditionally records an `INSERT`
into the history table — leaves an orphaned history row behind on every
conflicting upsert, not just a no-op one. `packages/game-data`'s
`upsertByExternalIds` and `packages/discord-bot-usage`'s
`selectThenUpsert` both select the row first and branch to a plain `insert`
or `update` for exactly this reason.

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
`NEW` at the moment it runs, which would then be _before_
`set_updated_at()` had bumped anything, so a genuine update's new history
row would capture the row's _previous_ `updated_at` instead of its current
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

### Star Player Points

[Star Player Points](glossary.md#star-player-points-spp) are denormalized
onto `match_events.spp_value` at import time, in the same spirit as
`match_teams.score` — a player's total is a plain `SUM` over their events
rather than a live re-derivation of rules-set-and-race-specific award rules.

`spp_award_values` holds the standardised award table, keyed
`(rules_set_id, race_id, action_type)`: a row with `race_id IS NULL` is that
rules set's baseline value for the action, and a non-null `race_id` row is a
per-race override. The table is unique on that key with `NULLS NOT DISTINCT`,
so the baseline row itself is unique per `(rules_set_id, action_type)` rather
than colliding with every override.

TP's own reported figure always wins over the table: BBL-sourced events,
which have no such figure, set `computeSppValue` and let the server resolve
a value from `spp_award_values`; TP-sourced events supply `sppValue`
directly, which takes precedence even if `computeSppValue` is also set.

`spp_award_values` is seeded by `tools/import-manual` in the
`before-other-importers` phase, so the table exists before any BBL or TP
match data is imported.

`rules_sets` also carries five `characteristic_format` columns
(`move_format`, `strength_format`, `agility_format`, `passing_format`,
`armour_format`), which say whether the rules set has each position
characteristic at all and how it is displayed: `absent` (no such
characteristic — only ever Passing, in the pre-BB2020 rules sets), `bare` (a
plain number), `plus` (a trailing "+", the value being a target a die roll
has to meet) or `plus_zero_legal` (the same target-number format as `plus`,
except a stored 0 is itself legal and renders as a bare "0" rather than the
meaningless "0+" — used only for Passing, where 0 means the position
structurally cannot pass).

`position_rules_sets` is the position × rules-set association, holding that
position's Move, Strength, Agility, Passing and Armour under that rules set,
keyed by `(position_id, rules_set_id)`. `passing` is nullable, for rules sets
whose `passing_format` is `absent`. A missing row means the position did not
exist under that rules set. `PositionRulesSetsService.sync` in
`packages/game-data` is the single place that writes it, and it rejects any
row whose values disagree with the rules set's declared formats.

`skills` is the catalogue of named player abilities (Block, Dodge,
Regeneration, ...), carrying only a name; `skills_external_ids` links each to
the source systems that name it, exactly as every other imported entity. A
skill's _category_ is not on the row, because a rules set can move a skill
between categories (BB2025 introduced Devious and moved existing skills into
it) — it lives on `skill_rules_sets`, the skill × rules-set association, keyed
by `(skill_id, rules_set_id)` and carrying a `skill_category` enum column
(`general`, `agility`, `passing`, `strength`, `mutation`, `devious`, `trait`,
`unique`). `unique` is the category for the one skill a rules set makes
exclusive to a given star player — used instead of a per-association flag, so
an ordinary skill row stays shareable between positions and a star player's
exclusive skill is identified purely by checking its category.

This is deliberately not enforced as globally unique across star players: if
two star players are published sharing the same "unique" skill, that is not
treated as a data error. A missing `skill_rules_sets` row means the skill does
not exist under that rules set. This is the same split, for the same reason,
as characteristics living on `position_rules_sets` rather than on `positions`.

The same row also carries `is_elite`, BB2025's orthogonal "elite" marker on a
handful of skills (Block, Dodge, Guard, Mighty Blow) that cost more player
value to pick than a non-elite skill — not a restriction on which skills can
be picked, and player value itself is not yet modeled, so this only records
which skills the cost applies to. It is a plain boolean rather than another
`skill_category` value because it cuts across categories, and it is `false`
on every row for every rules set older than BB2025, none of which has the
concept at all. Like the category, it is curated
in `tools/import-manual` (`data/before-other-importers/skills.json5`); the TP
importer only reads it back, to cross-check the marker TP's own source data
carries, while BBL has no such marker at all and always supplies `false`.

`position_rules_set_skills` records a position's _starting_ skills, anchored
to `position_rules_sets.id` rather than to a duplicated position/rules-set
pair, so a starting skill can only ever be recorded against a position and
rules set that already has characteristics recorded.
`PositionRulesSetSkillsService.sync` in `packages/game-data` is the single
place that writes it, and it rejects a row naming a skill with no
`skill_rules_sets` entry for that rules set, or a position/rules-set pair with
no `position_rules_sets` row yet.

`players` carries its own `move`, `strength`, `agility`, `passing` and
`armour`: both BBL and TP report a player's _current_ characteristics, which
drift from the position's baseline through injuries and advancements, so
these are stored per player rather than derived from `position_rules_sets`. A
player has exactly one current line — unlike a position, which has one per
rules set — so the columns live directly on the row, and no rules set is
stored alongside them (an era can list several rules sets in sequence, so
none can be derived from a player unambiguously). `passing` is nullable with
the same meaning as on `position_rules_sets`: NULL asserts that the player's
rules set has no Passing characteristic. The other four are NOT NULL with a
temporary `DEFAULT 0` — a placeholder, since 0 is not a legal value for any of
those four under any rules set — until the BBL and TP imports populate real
values. This does not extend to `passing`, for which 0 is a real value under
a `plus_zero_legal` rules set.
`PlayersService.upsert` accepts the five as an all-or-nothing group paired
with a `rulesSetId` that is used only to validate them (via the same
`CharacteristicFormatValidationService` that `PositionRulesSetsService` uses)
and is never persisted.

## Discord bot user-facing messages

Every error or status message the Discord bot can send to a user lives in
`apps/discord-bot/src/error-messages.ts` as a named `SCREAMING_SNAKE_CASE`
string constant.

- **One constant per call site.** Each constant is referenced from exactly one
  place in production code — or, for a fact backed by a shared helper (e.g.
  `resolveToplist` in `insights/leaderboard.service.ts`), from every call site
  within that one originating fact, since the helper takes the message as a
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

Each app in `apps/` has its own `Dockerfile`. The root `docker-compose.yml` defines services for PostgreSQL and each app, enabling a full local environment with a single `docker compose up`.
