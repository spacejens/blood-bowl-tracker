# Architecture

Overview of the technical stack and package structure for this project.

## Technology choices

- **Runtime:** Node.js with TypeScript across all packages and apps
- **Application framework:** NestJS on Express
- **Database:** PostgreSQL, accessed via Drizzle ORM (v1.0, currently pre-release)
- **API contract:** [oRPC](https://orpc.dev/) — a typed contract shared between server and client, dispatched over oRPC's native RPC transport (not REST/OpenAPI), enforced at compile time
- **Testing:** Vitest
- **Package manager:** pnpm with workspaces
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
                        enum's member list, as plain as-const string arrays,
                        and its value type ((typeof X)[number]), which every
                        package imports; plus the well-known external-system
                        names (Name, NAF, BBL's tloeg.bbleague.se, TP's
                        tourplay.net); deliberately depends on no other
                        workspace package so packages/db and
                        packages/api-contract can each build from it while
                        staying mutually independent
  game-data/          — DB-backed business logic for core game entities;
                        depends on packages/db, on packages/api-contract for
                        shared contract shapes (Upsert* types) and on
                        packages/domain-enums for enum value types; no
                        network dependency; usable directly by any app
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
                        apps/discord-bot (writes and reads)
  discord-client/     — NestJS module wrapping discord.js for connecting to
                        Discord, registering slash commands, and posting
                        messages; reports every handled interaction to
                        registered listeners as plain data, with no database
                        dependency; consumed by apps/discord-bot
  import/             — NestJS module with import orchestration logic:
                        generic upsert bookkeeping (ImportRunnerService,
                        BatchBufferService, ExternalIdResolverService) plus
                        entity-specific import services (coaches,
                        teams, players, matches, trophies, and so on) that
                        call api-client; also owns the config-service factories the import
                        tools' own config, external-system-name and source
                        services are built from
  import-shared/      — NestJS module with the pure, I/O-free import rules
                        packages/import and packages/import-tp-live must
                        apply identically: Name external-id formats, import
                        result construction, upsert error recording and the
                        cup/season span rule
  import-tp-live/     — server-side NestJS module importing one TP roster or
                        one completed TP match, with its teams and
                        competition, or one rules set's official team list,
                        through packages/game-data: the core behind
                        tpRosters/tpMatches/tpCompetitions/tpOfficialTeams.import and live entry points
  parse-tp/           — library package for reusable TP JSON-parsing logic
                        (matches, rosters, awards, tournaments) and the TP
                        keys both import paths must agree on (the hired-star
                        external id); its output that crosses the API is
                        typed with packages/api-contract's TP wire shapes;
                        consumed by tools/import-tp and
                        packages/import-tp-live
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
                        curated data batch reading (file walking and pooling,
                        no entry shaping), and the plug-in interfaces + DI
                        wiring each data-type module registers through;
                        carries no BBL/TP parsing or interpretation logic
  scrape-tp/          — NestJS module with the one implementation of fetching
                        TP's API over plain HTTP: browser-like headers and
                        per-visit sessions with a cookie jar and randomized
                        pacing; no TP URL knowledge, no config, and no
                        dependency on any other workspace package; consumed by
                        tools/download-tp and packages/import-tp-live
  tp-paths/           — every TP path this repo requests (roster,
                        tournament and all its pages, match, official teams,
                        plus the official-teams rules-set id map) as TP's
                        frontend requests them, and the reverse: which kind
                        of TP page a URL points to; pure, no I/O, shared by
                        tools/download-tp and import-tp-live

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
                        other review tools, likewise a developer review
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
  cli-shared/         — library package with the plumbing the CLI
                        packages below share: git main-checkout/worktree
                        resolution, child-process running and spawning, the
                        canonical gitignored file/directory lists, the
                        dotenv-based reader for production's secrets in
                        apps/discord-bot/.env.production, and the shared
                        runCli subcommand-dispatcher driver every
                        entrypoint runs on (workflow-lint uses only runCli);
                        no CLI entry point of its own
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
  backup-cli/         — NestJS CLI application that backs up the production
                        database to a private Cloudflare R2 bucket, lists,
                        prunes, downloads and verifies those backups,
                        restores one into the local development database,
                        and raises and resolves the backup alert issues;
                        run daily by .github/workflows/backup-production.yml
  workflow-lint/      — NestJS CLI application that fails pnpm lint when a
                        workflow in .github/workflows/ references a remote
                        action by anything other than a full commit SHA
```

## Data flow

- `apps/discord-bot` imports `packages/api-server` (to host the `/rpc` endpoint) and can import `packages/game-data` directly for any in-process feature that needs coach/external-system data, without a network hop
- `apps/discord-bot` also imports `packages/import-tp-live` and `packages/tp-paths` directly, for the `/importtp` on-demand TP import and the TP notification feed's automatic imports: both classify a TP URL with `TpPageClassifierService` and call the matching live entry point in-process through one shared dispatch
- `tools/import-*` import `packages/import`, which internally calls `packages/api-client` to reach a deployed `api-server` over the network
- `packages/api-server` also imports `packages/import-tp-live` to implement `tpRosters.import`, `tpMatches.import`, `tpCompetitions.import` and `tpOfficialTeams.import`; `packages/import-tp-live` calls `packages/game-data` in-process and never reaches the api-server over RPC, so `apps/discord-bot` can call it directly while `tools/import-tp` reaches it only through those procedures
- `packages/api-server` imports `packages/game-data` (for persistence) and `packages/api-contract` (for the RPC contract it implements) — it has no dependency on `packages/db` directly
- `packages/game-data` has no dependency on any network-facing package — it is pure business logic over `packages/db`

## Client/server boundary

Which side of the API each kind of workspace sits on. Unlike "Data flow" above, which describes today's actual import graph, this is the rule new code must keep to.

- `apps/` are server-side (currently only `apps/discord-bot`); they call server-side packages like `packages/game-data` in-process and must never be forced to call themselves through the API
- `tools/` are client-side; a tool that needs server-side logic goes through `packages/api-client` over the network rather than importing a server-side package (`packages/game-data`, `packages/db`, `packages/api-server`) directly. The `tools/review-*` family (`review-match`, `review-player`, `review-race`, `review-star-player`) is a deliberate exception: they read `packages/db` directly as local-only developer report aids outside the import pipeline, never touching the API. `tools/import-manual` is a second, test-only exception: it lists `packages/api-server` and `packages/db` as devDependencies so its e2e harness can start the real `ApiServerModule` in-process and query the game-data tables directly (see [import-manual batches](import-manual/batches.md#tested)); its production code under `src/` stays client-side and reaches the server only through `packages/api-client` and `packages/import`
- `packages/` are usually one-sided (client-only or server-only). Deliberate exceptions exist for shared-shape/enum packages designed to serve both sides: `packages/api-contract` (the RPC contract, built on `packages/domain-enums` and external libraries), `packages/domain-enums` (the enum source of truth, with no dependencies of its own), `packages/tp-paths` (TP file-path computation shared between `packages/import-tp-live` and `tools/download-tp`, also with no dependencies of its own), `packages/scrape-tp` (the TP request fetching shared between the client-side `tools/download-tp` and the server-side `packages/import-tp-live`, with no workspace dependencies), `packages/parse-tp` (TP JSON parsing shared between the client-side `tools/import-tp` and the server-side `packages/import-tp-live`, whose only workspace dependencies are `packages/domain-enums` and `packages/api-contract`, which owns the TP wire shapes its output is typed with), and `packages/import-shared` (the import rules the client-side `packages/import` and the server-side `packages/import-tp-live` must apply identically, whose only workspace dependencies are `packages/api-contract`'s types and `packages/domain-enums`)

## Tool/app relationships

Which tools and apps feed each other along the download → import → consume
pipeline. Use this to judge whether a change in one place needs a matching
change — or opens an opportunity — somewhere else. Only participants in that
pipeline are listed; packages and tools with no role in it (e.g. `packages/db`,
`tools/db-diagram`, `tools/eslint-rules`, `tools/markdownlint-rules`) are omitted.

- **`tools/download-tp`** (downloader) — fetches TP's API via `packages/scrape-tp` into local JSON files; what it records is exactly what `tools/import-tp` can later import, so widening or narrowing the download changes what is importable at all
- **`packages/scrape-tp`** (shared fetching) — the one implementation of how this repo makes HTTP requests TP accepts: the browser-like header set, per-visit sessions with a cookie jar, and randomized pacing between a session's requests. Consumed by `tools/download-tp` and `packages/import-tp-live` (and through it `apps/discord-bot`'s on-demand `/importtp`), so a change to how requests look reaches both. It deliberately knows no TP URLs or page-to-endpoint mapping — those stay with each consumer — and depends on no other workspace package
- **`packages/parse-tp`** (shared parsing) — decodes `tools/download-tp`'s JSON; consumed by `tools/import-tp` and `packages/import-tp-live`. It also owns the TP keys both import paths must build identically, such as `TpStarHireKeyService`'s hired-star external id. Its output that crosses the API (awards, official team list races, match-embedded players) is typed with `packages/api-contract`'s TP wire shapes rather than declared again here, so a change to one of those shapes is a contract change that reaches the parser, `packages/import-tp-live` and `tools/import-tp` together. It has no BBL counterpart: BBL _interpretation_ (page-type parsing, HTML extraction) stays inside each tool that does it, deliberately, so the review tools can check the importer's reading of a page against their own. Only the mechanical file access is shared, via `packages/read-bbl-mirror`
- **`packages/import-tp-live`** (TP roster and match import, server-side) — imports one TP roster's team and players, one completed TP match with its teams and competition, one competition with its registered teams and trophy awards (a finished competition import also awards the extra trophies TP does not record), or one rules set's official team list, directly through `packages/game-data`.
  - It contains the live imports (fetch via `packages/scrape-tp`, parse via `packages/parse-tp`, era auto-resolution; a live match import creates the competition it needs).
  - It also contains the implementations behind `tpRosters.import`, `tpMatches.import`, `tpCompetitions.import` and `tpOfficialTeams.import`, which `tools/import-tp`'s bulk run calls once per roster file, match file, competition or rules set — so a change to how a TP team, player (including the player's own skills), match, competition or official team list is imported reaches bulk and live imports together.
  - `apps/discord-bot` calls the same `TpLive*ImportService` entry points directly, in-process, for its `/importtp` slash command and its TP notification feed (which also imports both teams of a starting match through `TpLiveMatchTeamsImportService`).
  - Deliberately depends on neither `packages/import` nor `packages/api-client` (see `docs/import-tp-live/index.md`); the import rules it must share with the bulk importers come from `packages/import-shared`.
- **`packages/tp-paths`** (shared TP paths) — every TP path the repo requests: roster, tournament (including the news, classifications, honours and statistics pages only `tools/download-tp` fetches), match and official-teams paths (plus the official-teams rules-set id map), and the reverse direction.
  - `TpPageClassifierService` classifies a TP frontend URL as a competition, competition scores, match, roster or official-teams page (or unknown) with the ids the matching `packages/import-tp-live` entry point needs, so every on-demand consumer makes the same determination.
  - Pure and I/O-free — the frontend base URL is a parameter, not config — so the client-only `tools/download-tp` and the server-side `packages/import-tp-live` can both depend on it without either gaining the other's dependencies.
  - `apps/discord-bot` depends on it directly too, to classify a pasted TP URL for `/importtp` and a notification's link for the TP feed.
- **`packages/import-shared`** (shared import rules) — the pure, I/O-free rules a bulk import and a live import must apply identically.
  - It holds the "Name" external-id formats (`NameExternalIdService`), `ImportError`/`ImportResult` construction typed with `packages/api-contract`'s types (`ImportResultService`), per-item upsert error recording (`UpsertRecorderService`) and the at-most-three-days cup rule (`CompetitionTypeService`).
  - Consumed by `packages/import`, which re-exports it to every `tools/import-*` (`tools/import-bbl` classifies competitions through `CompetitionTypeService`), and by `packages/import-tp-live`, so a change here reaches bulk and live imports together.
  - The Name ids are identity-critical: if the two sides wrote different strings, a live and a bulk import of the same coach, team or position would create two rows.
- **`packages/read-bbl-mirror`** (shared mirror access) — the mechanics of getting text out of a BBL wget mirror directory.
  - It resolves a filename safely against a caller-supplied data directory.
  - It reports a missing file as `null` and a missing directory as an empty listing.
  - It decodes bytes as ISO-8859-1, and lists plain files.
  - Consumed by `tools/import-bbl`, `tools/review-match`, `tools/review-player`, `tools/review-race` and `tools/review-star-player`, so a change here reaches all of them at once.
  - It carries no BBL-page-type awareness and no HTML parsing on purpose: which files matter, what their names mean and what their contents say stay with each consumer, which is what keeps the review tools' independence from importer logic intact.
  - Like `packages/config-loader`, it deliberately depends on no other workspace package.
- **`packages/discord-bot-usage`** (bot telemetry) — records what the bot was asked to do, not what it knows: every matched slash command, button click and select-menu selection lands in the `discord_bot_usage` schema.
  - `apps/discord-bot`'s `UsageRecordingService` is its only writer: it listens on `packages/discord-client`'s interaction-handled hook, which reports each interaction after it has already been replied to, fire-and-forget, so a recording failure can never affect a user-facing reply.
  - The wiring lives in the app rather than in `packages/discord-client`, so the Discord transport package stays free of any database dependency.
  - `apps/discord-bot` reads it back through `InteractionEventsQueryService`, for the `/debuginteractions`, `/debugtopusers` and `/debugfilterusage` maintainer commands.
  - Broader reporting on the captured data is still separate work.
- **`tools/import-bbl`** (importer, BBL source) — sibling of `tools/import-tp`; the same domain data usually exists in both upstream sources, so behavior added to one importer is usually wanted in the other; it reads the mirror's files through `packages/read-bbl-mirror`, while every BBL page-type and HTML interpretation stays in the tool
- **`tools/import-tp`** (importer, TP source) — reads `tools/download-tp`'s files via `packages/parse-tp`; sibling of `tools/import-bbl`, with the same reciprocity; its team, player, competition, match and official team list import go through the `tpRosters.import`, `tpCompetitions.import`, `tpMatches.import` and `tpOfficialTeams.import` procedures, one call per roster file, competition, match file or rules set; player skills and their Hatred/Animosity targets are interpreted only server-side, inside `tpRosters.import`
- **`tools/import-manual`** (importer, hand-authored data) — runs before and after the source importers and supplies entities they reference (leagues, eras, rules sets, races, positions, coaches, teams, extra external IDs); a new entity kind imported by a source importer often needs matching manual data. It can also supply characteristics a source importer reads back over the API rather than deriving itself — see the gap-fill pattern in `docs/import-manual/index.md`
- **`packages/import`** (shared import orchestration) — used by every `tools/import-*`; a change here reaches all importers at once. It owns:
  - **The shared upsert plumbing** (`createUpsertImportServiceBase`) alongside the runner and batch helpers; for entities with exactly one upsert call, the import service is a declarative subclass supplying only the client resource it upserts through and the wording of its per-item error message, giving it the base class's shared `upsert(data, errors)` method — a subclass may still add its own entity-specific extra method alongside it.
  - **Two kinds of hand-written exception.** Entities with more than one _upsert_ entry point stay hand-written, since the base class's single `upsert` method can't express two upsert entry points; `ExternalSystems` and `SppAwardValues` stay hand-written for a different reason — an underlying resource that isn't shaped like a plain upsert.
  - **A config-object factory rather than `review-harness`'s abstract-class pattern**, because what varies per entity here is only _data_ (which client resource, what error wording), not _behavior_ — a factory taking a config object fits that better than an abstract class with template methods to override. This is the "class factory for a base service" exemption (case 5) in `CLAUDE.md`'s "Service vs. loose function".
  - **The same kind of factory for the import tools' config services** — `createImportConfigServiceBase` (connection getters plus the `IMPORT_CONFIG_ENV` production-file swap, over `packages/config-loader`) and `createSourceConfigServiceBase` — so each tool's config and source-config services are declarative subclasses supplying only their own file name, env var and DI token (the same `CLAUDE.md` case 5 class-factory exemption).
  - **Not per-entity _parsing_ logic:** the BBL and TP entity import services look similar but genuinely differ in what they extract, so they stay per-tool.
  - **Read calls for contract procedures:** `listCompetitionGroups`, backing `competitionGroups.list`.
- **`packages/config-loader`** (shared config loading) — the source-agnostic JSON5 config-file loading (`createConfigLoaderServiceBase`) behind every import tool's config service (via `packages/import`'s `createImportConfigServiceBase`), `tools/download-tp`'s, `tools/backup-cli`'s, and `packages/review-harness`'s.
  - `packages/review-harness` goes via its own `createReviewConfigServiceBase`, a factory over `createConfigLoaderServiceBase` in the same shape as `packages/import`'s, layering its own review-specific accessors on top; both are class factories under `CLAUDE.md`'s "Service vs. loose function" case 5.
  - `packages/config-loader` knows nothing about what a config file contains: each caller supplies its own top-level schema, DI path token and getters.
  - A change here changes _how_ config files are read for every config-reading tool at once; it does not define _what_ any of them accepts — each caller's own domain schema stays with the caller, not this package.
  - It deliberately depends on no other workspace package, keeping the `tools/* → packages/*` direction intact.
- **`packages/review-harness`** (shared review scaffolding) — used by every review tool (`tools/review-match`, `tools/review-player`, `tools/review-race`, `tools/review-star-player`); a change here reaches all review tools at once.
  - It owns the review-run orchestration (`ReviewServiceBase`) and the report document shell (`ReportBuilderBase`).
  - It also owns three leaf helpers shared by the tools:
    - `ExternalSystemLookupService` (the memoized `external_systems.id` lookup by each source's shared external-system name from `packages/domain-enums`).
    - `CharacteristicFormatService` with its none marker (rendering one characteristic for a `CharacteristicFormat` from `packages/domain-enums`), duplicated between `review-player` and `review-race` (review-match has no characteristics to format).
    - `ManualBatchReaderService` (the mechanical reading of the hand-curated data batches: walking every batch directory and then every `.json5` file in name order, pooling each top-level array section with a missing, malformed or non-object file counted as empty, memoized per batches directory, plus the later-entry-wins `latestByKey`), used by `review-player`, `review-race` and `review-star-player` (review-match reads no curated data). It shapes no entry: each tool still reads what a curated entry means itself.
  - Each tool's `ReviewService`/`ReportBuilderService` is a thin subclass supplying only what differs, and each tool provides the leaf helpers it uses by plain import.
  - It deliberately carries no BBL/TP parsing or interpretation logic — raw-source parsing, comparison predicates and label tables stay duplicated per tool, see the review-tool entries below.
- **`packages/api-contract`** (shared shapes) — newly imported data must exist in the contract before an importer can send it or a consumer can read it; a change here reaches api-server, api-client, game-data, import, import-shared and, for the TP wire shapes, parse-tp and import-tp-live together
- **`apps/discord-bot`** (consumer) — reads imported data via `packages/game-data`; data newly landed by any importer is a candidate for a new command, fact, or insight. It is also a direct importer in its own right: the `/importtp` slash command, and the TP notification feed for every recognised notification, classify a TP URL with `packages/tp-paths`' `TpPageClassifierService` and call the matching `packages/import-tp-live` entry point in-process
- **`tools/review-match`** (consumer, review aid) — renders raw BBL and TP source data beside imported match events, so a change to what either importer stores for match events usually needs a matching renderer change here
  - It deliberately interprets the raw sources itself and must never depend on `packages/parse-tp` or importer logic (the mechanical file access is shared via `packages/read-bbl-mirror`, which carries no interpretation and so does not weaken that rule) (see `docs/review-match/index.md`). Depending on `packages/domain-enums` for match categories is likewise allowed, since it holds constants and types only, no interpretation.
  - That independence rule covers the domain-specific half only; the generic report scaffolding is shared on purpose via `packages/review-harness`, where its `ReviewService` and `ReportBuilderService` subclass `ReviewServiceBase`/`ReportBuilderBase` and add only the match-result lookup and the per-match section.
- **`tools/review-player`** (consumer, review aid) — renders raw BBL and TP source data beside imported player records (identity, team, position, era) and star player point totals, so a change to what either importer stores for players usually needs a matching renderer change here
  - Sibling of `tools/review-match`, structured the same way and deliberately independent of it.
  - It interprets the raw sources itself and must never depend on `packages/game-data`, `packages/parse-tp`, `packages/import`, or either importer (the mechanical file access is shared via `packages/read-bbl-mirror`, which carries no interpretation) (see `docs/review-player/index.md`).
  - Walking the curated keyword batches is shared the same way, via `packages/review-harness`'s `ManualBatchReaderService`, which shapes no entry: every reading of what a curated keyword means stays in this tool.
  - That independence rule covers the domain-specific half only; the generic report scaffolding is shared on purpose via `packages/review-harness`, where its `ReviewService` and `ReportBuilderService` subclass `ReviewServiceBase`/`ReportBuilderBase` and add only the per-player section.
- **`tools/review-race`** (consumer, review aid) — renders raw BBL, TP and hand-curated source data beside imported races, `positions_race_eras` and `position_rules_sets`, so a change to what any of the three importers stores for races or positions usually needs a matching renderer change here
  - Sibling of `tools/review-match` and `tools/review-player`, structured the same way.
  - It interprets the raw sources itself and must never depend on `packages/game-data`, `packages/parse-tp`, `packages/import`, `tools/import-bbl`, `tools/import-tp` or `tools/import-manual` (the mechanical file access is shared via `packages/read-bbl-mirror`, which carries no interpretation and so needs no such callout) (see `docs/review-race/index.md`).
  - Walking the curated batches is shared the same way, via `packages/review-harness`'s `ManualBatchReaderService`, which shapes no entry: every reading of what a curated entry means stays in this tool.
  - That independence rule covers the domain-specific half only; the generic report scaffolding is shared on purpose via `packages/review-harness`, where its `ReviewService` and `ReportBuilderService` subclass `ReviewServiceBase`/`ReportBuilderBase` and add only the per-race section.
  - It is the first review tool to treat the hand-curated `tools/import-manual` data as a raw source, which is why `ReviewSource` gained `'manual'`.
- **`tools/review-star-player`** (consumer, review aid) — renders raw BBL, TP and hand-curated star data beside imported `positions`, `position_rules_sets` and `positions_race_eras`, so a change to what any of the three importers stores for star players usually needs a matching renderer change here
  - Sibling of `tools/review-match`, `tools/review-player` and `tools/review-race`, structured the same way.
  - It interprets the raw sources itself and must never depend on `packages/game-data`, `packages/parse-tp`, `packages/import`, `tools/import-bbl`, `tools/import-tp`, `tools/import-manual` or `tools/review-race` (the mechanical file access is shared via `packages/read-bbl-mirror`, which carries no interpretation and so needs no such callout) (see `docs/review-star-player/index.md`).
  - Walking the curated batches is shared the same way, via `packages/review-harness`'s `ManualBatchReaderService`, which shapes no entry: every reading of what a curated entry means stays in this tool.
  - That independence rule covers the domain-specific half only; the generic report scaffolding is shared on purpose via `packages/review-harness`.
  - It exists because `tools/review-race` deliberately excludes star players from its per-race panels — a star is not owned by one race, so a per-race report is the wrong place to review it.

## Key decisions

**Drizzle in its own package.** The pre-release Drizzle dependency is isolated to `packages/db`, so the risk of breaking changes is contained to one place.

- Every other workspace builds queries with the operators and types `packages/db` re-exports — and, in specs, the test-only ones on its `/test-helpers` subpath — rather than importing `drizzle-orm` itself.
- The boundary is enforced by an automated test, not convention alone: `packages/db/src/dependency-boundary.spec.ts` scans every workspace's `package.json` and fails if anything but `packages/db` declares `drizzle-orm` or `postgres`.
- `drizzle-orm` and `drizzle-kit` are pinned to one exact release-candidate version in `packages/db/package.json`, never a floating dist-tag such as `rc`. A new release candidate is then an explicit, reviewable version bump, never something a lockfile refresh in an unrelated PR pulls in silently. `renovate.json5` groups the two packages so they update together.
- `AdvisoryLockService` — leader election's session-scoped Postgres advisory lock — lives in `packages/db` for the same driver-isolation reason: it needs its own `postgres.js` connection rather than drizzle's pool, and keeping it here is what lets `apps/discord-bot` declare no driver dependency at all.
- The driver-facing helpers that more than one consumer needs live here too: `DbOrTx` (a `Db` or a transaction handle), `asBaseTable` (the generic-table widening for `.from()` and `.insert()`), and `isUniqueViolationOn`, the one classifier for a Postgres unique violation (SQLSTATE 23505) on a given table, unwrapped from drizzle's `DrizzleQueryError`. `packages/game-data` and `packages/discord-bot-usage` both use it to recover from concurrent-insert races, so the two can't classify the same error differently.

**oRPC over ts-rest.** ts-rest's development had stalled — its only zod 4-compatible release was an unpromoted release candidate over a year old — which was blocking a needed zod upgrade. oRPC is actively maintained and supports zod 4.

**RPC transport over REST/OpenAPI.** oRPC supports both; REST/OpenAPI modeling (HTTP verbs, per-route status codes, path design) was evaluated first and found to add real friction for zero benefit, since every consumer of this API is TypeScript within this monorepo and there's no plan for external or non-TypeScript consumers. Plain RPC dispatch removes that overhead entirely.

**game-data as its own package, separate from api-server.** Business logic needs to be usable by any app directly (in-process, no network hop) without pulling in the network-transport layer. Splitting them also made it easy to delete the 14 API resources that had zero callers anywhere (HTTP or direct injection) without touching business logic for the 2 resources that are actually used.

**api-server as a package, not an app.** The Discord bot is the only deployment target, so the RPC dispatch layer lives in a package it hosts in-process via NestJS module composition, rather than a separately deployed service.

**One import tool per source.** Importing data from different upstream applications requires different extraction and transformation logic. Separate tools keep each integration self-contained, sharing common upsert/client-wrapping logic via `packages/import`.

**Client packages stay separate from the business logic that uses them.** `packages/api-client` and `packages/discord-client` hold reusable technical plumbing (API transport, Discord client lifecycle) deliberately kept separate from the business logic built on top of it. `discord-client` has exactly one consumer today, `apps/discord-bot`; `api-client` already has several consumers — `packages/import` and each `tools/import-*` CLI configure it directly. Either way, keeping the transport layer as its own package means no untangling is needed as the set of consumers changes. For the same reason `discord-client` does not record usage itself: it exposes an interaction-handled hook, and `apps/discord-bot` decides what to do with each event.

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
the specs of every workspace that builds drizzle queries. It is reachable as
`@blood-bowl-tracker/db/test-helpers` (a separate export subpath whose compiled
output carries its own `{"type": "module"}` marker, so importing the package's
main entry point never pulls Vitest into a consumer's runtime graph).
`packages/db` is the shared home because it is a package every consumer already
depends on and it carries nothing network-facing, so promoting the helper there
crosses no dependency-direction rule.

## Database

Migrations, history tracking and the Star Player Points model are
documented in [database.md](database.md).

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
