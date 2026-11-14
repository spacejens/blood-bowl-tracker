# Architecture

The technical stack, the rules that span more than one workspace, and an
index of every app, package and tool with a link to its own documentation.
Each workspace's own behavior, dependencies and design rules live on its page
under `docs/<name>/`; this page only summarizes them.

## Technology choices

- **Runtime:** Node.js with TypeScript across all packages and apps
- **Application framework:** NestJS on Express
- **Database:** PostgreSQL, accessed via Drizzle ORM (v1.0, currently pre-release)
- **API contract:** [oRPC](https://orpc.dev/) — a typed contract shared between server and client, dispatched over oRPC's native RPC transport (not REST/OpenAPI), enforced at compile time
- **Testing:** Vitest
- **Package manager:** pnpm with workspaces
- **Deployment:** Docker, with a root `docker-compose.yml` for local development and on Fly.io + Neon in production (see [production hosting](discord-bot/production-hosting.md))

## Data flow

- `apps/discord-bot` hosts `packages/api-server`'s `/rpc` endpoint in-process
  and reads through `packages/game-data` and `packages/game-data-queries`
  without a network hop. It also imports TP data on demand through
  `packages/import-tp-live` (see [discord-bot](discord-bot/index.md#how-it-fits-together)).
- `tools/import-*` reach the server over the network: `packages/import` calls
  `packages/api-client`, which calls the hosted api-server's `/rpc` (see
  [import](import/index.md) and [API](api/index.md)).
- `packages/api-server` dispatches into `packages/game-data` and, for the
  `tp*.import` procedures, into `packages/import-tp-live`; it has no direct
  `packages/db` dependency.
- `packages/import-tp-live` calls `packages/game-data` in-process and never
  goes over RPC, so the bot calls it directly while `tools/import-tp` reaches
  it only through those procedures.
- `packages/game-data` is pure business logic over `packages/db`, with no
  network-facing dependency; `packages/game-data-queries` depends on it
  one-way, and only `apps/discord-bot` imports `packages/game-data-queries`.

## Client/server boundary

Which side of the API each kind of workspace sits on. Unlike "Data flow" above, which describes today's actual import graph, this is the rule new code must keep to.

- `apps/` are server-side (currently only `apps/discord-bot`); they call server-side packages like `packages/game-data` and `packages/game-data-queries` in-process and must never be forced to call themselves through the API.
- `tools/` are client-side; a tool that needs server-side logic goes through `packages/api-client` over the network rather than importing a server-side package (`packages/game-data`, `packages/game-data-queries`, `packages/db`, `packages/api-server`) directly. Deliberate exceptions:
  - The `tools/review-*` family (`review-match`, `review-player`, `review-race`, `review-star-player`) reads `packages/db` directly, as local-only developer report aids outside the import pipeline that never touch the API.
  - `tools/import-manual` lists `packages/api-server` and `packages/db` as devDependencies, test-only, so its e2e harness can start the real `ApiServerModule` in-process and query the game-data tables (see [import-manual batches](import-manual/batches.md#tested)); its production code stays client-side.
- `packages/` are usually one-sided (client-only or server-only). Deliberate exceptions are the shared-shape, shared-rule and dependency-free packages designed to serve both sides, each with its reasoning on its own page:
  - `packages/api-contract` — the RPC contract (see [API](api/index.md#api-contract)).
  - `packages/domain-enums` — the enum source of truth (see [domain-enums](domain-enums/index.md)).
  - `packages/tp-paths` — TP request and path computation (see [tp-paths](tp-paths/index.md)).
  - `packages/scrape-tp` — TP request fetching (see [scrape-tp](scrape-tp/index.md)).
  - `packages/parse-tp` — TP JSON parsing (see [parse-tp](parse-tp/index.md)).
  - `packages/parse-tp-feed` — TP feed advancement-report parsing (see [parse-tp-feed](parse-tp-feed/index.md)).
  - `packages/logging` — shared error-log shaping (see [logging](logging/index.md)).
  - `packages/import-shared` — the import rules bulk and live imports share (see [import-shared](import-shared/index.md)).

## Tool/app relationships

Which tools and apps feed each other along the download → import → consume
pipeline. Use this to judge whether a change in one place needs a matching
change — or opens an opportunity — somewhere else, then open the linked page
for the specifics. Only participants in that pipeline are listed.

- **`tools/download-tp`** (downloader) — fetches TP's API into local JSON files; `tools/import-tp` can only import what it recorded (and not all of that: news, classifications, honours and statistics are download-only). See [download-tp](download-tp/index.md).
- **`packages/scrape-tp`** (shared fetching) — the one implementation of HTTP requests TP accepts, shared by `tools/download-tp` and `packages/import-tp-live`. See [scrape-tp](scrape-tp/index.md).
- **`packages/tp-paths`** (shared TP paths) — every TP path the repo requests, and which kind of TP page a URL points to; shared by `tools/download-tp`, `packages/import-tp-live` and `apps/discord-bot`. See [tp-paths](tp-paths/index.md).
- **`packages/parse-tp`** (shared parsing) — decodes `tools/download-tp`'s JSON for `tools/import-tp` and `packages/import-tp-live`, typed with the contract's TP wire shapes; it has no BBL counterpart. See [parse-tp](parse-tp/index.md).
- **`packages/parse-tp-feed`** (shared TP feed parsing) — reads the TP feed channel's advancement reports for the bot's live feed and for `tools/production-ops-cli`'s `read-tp-feed-history`, so a live notification and one read back from history are understood alike. See [parse-tp-feed](parse-tp-feed/index.md).
- **`packages/read-bbl-mirror`** (shared mirror access) — mechanical BBL mirror file access, without interpretation, for `tools/import-bbl` and every review tool. See [read-bbl-mirror](read-bbl-mirror/index.md).
- **`packages/import-tp-live`** (TP import, server-side) — imports one TP roster, match, competition or official team list through `packages/game-data`; it backs both the `tp*.import` procedures and the bot's live imports, so a change reaches bulk and live imports together. See [import-tp-live](import-tp-live/index.md).
- **`packages/import-shared`** (shared import rules) — the I/O-free rules bulk and live imports must apply identically, including the identity-critical Name ids. See [import-shared](import-shared/index.md).
- **`packages/import`** (shared import orchestration) — used by every `tools/import-*`; a change here reaches all importers at once. See [import](import/index.md).
- **`packages/config-loader`** (shared config loading) — how every config-reading tool reads its JSON5 file, not what it accepts. See [config-loader](config-loader/index.md).
- **`packages/api-contract`** (shared shapes) — newly imported data must exist in the contract before an importer can send it or a consumer can read it. See [API](api/index.md#api-contract).
- **`tools/import-bbl`** (importer, BBL source) — sibling of `tools/import-tp`: behavior added to one importer is usually wanted in the other. See [import-bbl](import-bbl/index.md).
- **`tools/import-tp`** (importer, TP source) — reads `tools/download-tp`'s files and imports through the `tp*.import` procedures; sibling of `tools/import-bbl`. See [import-tp](import-tp/index.md).
- **`tools/import-manual`** (importer, hand-authored data) — runs before and after the source importers and supplies entities they reference; a new entity kind often needs matching manual data. See [import-manual](import-manual/index.md).
- **`apps/discord-bot`** (consumer) — newly imported data is a candidate for a new command, fact or insight; the bot is also a direct live TP importer. See [discord-bot](discord-bot/index.md#how-it-fits-together).
- **`packages/discord-bot-usage`** (bot telemetry) — records what the bot was asked to do; written and read only by the bot. See [discord-bot-usage](discord-bot-usage/index.md).
- **`packages/review-harness`** (shared review scaffolding) — the generic report scaffolding every review tool shares; it carries no BBL/TP interpretation. See [review-harness](review-harness/index.md).
- **`tools/review-match`** (consumer, review aid) — raw source data beside imported match events; a change to what an importer stores for match events usually needs a matching renderer change here. See [review-match](review-match/index.md).
- **`tools/review-player`** (consumer, review aid) — raw source data beside imported player records; same reciprocity for players. See [review-player](review-player/index.md).
- **`tools/review-race`** (consumer, review aid) — raw and curated source data beside imported races and positions; same reciprocity for races and positions. See [review-race](review-race/index.md).
- **`tools/review-star-player`** (consumer, review aid) — raw and curated source data beside imported star players; same reciprocity for star players. See [review-star-player](review-star-player/index.md).

Every review tool deliberately interprets the raw sources itself and never
depends on importer or parser logic; each page states exactly which packages
that rules out.

## Key decisions

**Drizzle in its own package.** The pre-release Drizzle dependency is isolated to `packages/db`, so the risk of breaking changes is contained to one place. An automated test enforces the boundary and the version is pinned exactly; see [db](db/index.md#why-drizzle-lives-in-its-own-package) for the details and the driver-facing helpers that live there for the same reason.

**oRPC over ts-rest.** ts-rest's development had stalled — its only zod 4-compatible release was an unpromoted release candidate over a year old — which was blocking a needed zod upgrade. oRPC is actively maintained and supports zod 4.

**RPC transport over REST/OpenAPI.** oRPC supports both; REST/OpenAPI modeling (HTTP verbs, per-route status codes, path design) was evaluated first and found to add real friction for zero benefit, since every consumer of this API is TypeScript within this monorepo and there's no plan for external or non-TypeScript consumers. Plain RPC dispatch removes that overhead entirely.

**game-data as its own package, separate from api-server.** Business logic needs to be usable by any app directly (in-process, no network hop) without pulling in the network-transport layer. Splitting them also made it easy to delete the 14 API resources that had zero callers anywhere (HTTP or direct injection) without touching business logic for the 2 resources that are actually used.

**Bot-only reads in game-data-queries, separate from game-data.** The importers load `packages/game-data` to persist data, and carrying the bot's reporting queries in the same entity services would ship code they never call and mix Discord insight changes with ingestion logic. Reads only `apps/discord-bot` uses live in `packages/game-data-queries`, which depends on `game-data` one-way; a read an importer or the API also needs stays in `game-data`.

**api-server as a package, not an app.** The Discord bot is the only deployment target, so the RPC dispatch layer lives in a package it hosts in-process via NestJS module composition, rather than a separately deployed service.

**One import tool per source.** Importing data from different upstream applications requires different extraction and transformation logic. Separate tools keep each integration self-contained, sharing common upsert/client-wrapping logic via `packages/import`.

**Client packages stay separate from the business logic that uses them.** `packages/api-client` and `packages/discord-client` hold reusable technical plumbing (API transport, Discord client lifecycle) deliberately kept separate from the business logic built on top of it. `discord-client` has exactly one consumer today, `apps/discord-bot`; `api-client` already has several consumers — `packages/import` and each `tools/import-*` CLI configure it directly. Either way, keeping the transport layer as its own package means no untangling is needed as the set of consumers changes. For the same reason `discord-client` does not record usage itself: it exposes an interaction-handled hook, and `apps/discord-bot` decides what to do with each event. Depending on `packages/domain-enums` for the interaction kind and outcome types does not change this, since it holds constants and types only, no business logic.

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

Migrations, history tracking and re-running importers are documented in
[database.md](database.md), which links to the pages on how Star Player
Points, characteristics and skills are stored. The package holding the schema
is described in [db](db/index.md).

## Environment variable naming

- `DATABASE_URL` is the only name any app or tool reads for its main
  Postgres connection string. No tool reads a prefixed alias of it, so one
  exported value works everywhere.
- A tool that needs a second database, a different target from its main
  one, gives that one its own explicit name rather than a prefix on
  `DATABASE_URL`: backup-cli's restore target is `LOCAL_DATABASE_URL`.
- GitHub secrets are named for their environment, such as
  `PRODUCTION_DATABASE_URL`. A workflow step maps the secret into
  `DATABASE_URL` in its `env` (see `backup-production.yml`); a calling
  workflow such as `deploy.yml` forwards the secret under its own name.
- Settings that are not a Postgres connection string may carry a tool
  prefix, which keeps them from colliding across tools: backup-cli's
  `BACKUP_STORAGE_*`, `BACKUP_RETENTION_DAYS` and `BACKUP_MAX_AGE_HOURS`.

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

## Workspace index

Every workspace, with a link to its documentation. The monorepo's top-level
folders are `apps/` (runnable applications), `packages/` (shared libraries
consumed by apps and tools, not standalone) and `tools/` (developer tooling
not shipped as part of any app).

### Applications

- **`apps/discord-bot`** — the Discord bot: scheduled facts, insights and deepdive slash commands, live TP imports, and the host of the RPC API. See [discord-bot](discord-bot/index.md).

### Packages

- **`packages/api-client`** — oRPC client for calling the hosted api-server over the network. See [api-client](api-client/index.md).
- **`packages/api-contract`** — the oRPC contract and Zod schemas shared by server and clients. See [API](api/index.md#api-contract).
- **`packages/api-server`** — the thin RPC transport layer the bot hosts in-process. See [API](api/index.md#api-server).
- **`packages/config-loader`** — generic JSON5 config-file loading. See [config-loader](config-loader/index.md).
- **`packages/db`** — Drizzle ORM schema and migrations for PostgreSQL. See [db](db/index.md).
- **`packages/discord-bot-usage`** — records every Discord bot interaction. See [discord-bot-usage](discord-bot-usage/index.md).
- **`packages/discord-client`** — discord.js wrapper for connecting, dispatching and posting. See [discord-client](discord-client/index.md).
- **`packages/domain-enums`** — the single declaration of every Blood Bowl domain enum. See [domain-enums](domain-enums/index.md).
- **`packages/game-data`** — server-side business logic and database access for core game entities. See [game-data](game-data/index.md).
- **`packages/game-data-queries`** — read-only statistics, toplists and lookups only the bot uses. See [game-data-queries](game-data-queries/index.md).
- **`packages/import`** — shared import orchestration for the `tools/import-*` CLIs. See [import](import/index.md).
- **`packages/import-shared`** — the pure import rules bulk and live imports share. See [import-shared](import-shared/index.md).
- **`packages/import-tp-live`** — server-side import of one TP roster, match, competition or official team list. See [import-tp-live](import-tp-live/index.md).
- **`packages/logging`** — one consistent shape for logging a caught exception. See [logging](logging/index.md).
- **`packages/parse-tp`** — reusable TP JSON parsing. See [parse-tp](parse-tp/index.md).
- **`packages/parse-tp-feed`** — parsing of the TP feed's advancement reports. See [parse-tp-feed](parse-tp-feed/index.md).
- **`packages/read-bbl-mirror`** — mechanical file access to BBL's `wget` mirror. See [read-bbl-mirror](read-bbl-mirror/index.md).
- **`packages/review-harness`** — the generic scaffolding behind the review tools. See [review-harness](review-harness/index.md).
- **`packages/scrape-tp`** — fetching TP's API over plain HTTP. See [scrape-tp](scrape-tp/index.md).
- **`packages/tp-paths`** — TP's URL paths and TP page classification. See [tp-paths](tp-paths/index.md).

### Tools

- **`tools/backup-cli`** — backs up, verifies and restores the production database. See [backup-cli](backup-cli/index.md).
- **`tools/cli-shared`** — plumbing the CLI tools share. See [cli-shared](cli-shared/index.md).
- **`tools/db-diagram`** — generates a SchemaSpy diagram of the local database. See [db-diagram](db-diagram/index.md).
- **`tools/dev-workflow-cli`** — developer/PR workflow helpers the Claude Code skills call. See [dev-workflow-cli](dev-workflow-cli/index.md).
- **`tools/download-tp`** — records TP's API responses as local JSON files. See [download-tp](download-tp/index.md).
- **`tools/eslint-rules`** — the repo's custom ESLint rules. See [eslint-rules](eslint-rules/index.md).
- **`tools/fs-utils-cli`** — worktree-aware filesystem helpers the Claude Code skills call. See [fs-utils-cli](fs-utils-cli/index.md).
- **`tools/import-bbl`** — imports BBL data. See [import-bbl](import-bbl/index.md).
- **`tools/import-manual`** — imports hand-authored supplementary data in once-applied batches. See [import-manual](import-manual/index.md).
- **`tools/import-tp`** — imports TP data. See [import-tp](import-tp/index.md).
- **`tools/markdownlint-rules`** — the repo's custom markdownlint rules. See [markdownlint-rules](markdownlint-rules/index.md).
- **`tools/production-ops-cli`** — production database and tunnel operations, and fetching Discord messages. See [production-ops-cli](production-ops-cli/index.md).
- **`tools/review-match`** — HTML report of raw match data against what was imported. See [review-match](review-match/index.md).
- **`tools/review-player`** — HTML report of raw player data against what was imported. See [review-player](review-player/index.md).
- **`tools/review-race`** — HTML report of raw race and position data against what was imported. See [review-race](review-race/index.md).
- **`tools/review-star-player`** — HTML report of raw star player data against what was imported. See [review-star-player](review-star-player/index.md).
- **`tools/workflow-lint`** — fails `pnpm lint` on a workflow action not pinned to a commit SHA. See [workflow-lint](workflow-lint/index.md).
