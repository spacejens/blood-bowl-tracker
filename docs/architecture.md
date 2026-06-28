# Architecture

Overview of the technical stack and package structure for this project.

## Technology choices

- **Runtime:** Node.js with TypeScript across all packages and apps
- **Application framework:** NestJS 11 on Express
- **Database:** PostgreSQL, accessed via Drizzle ORM (v1.0, currently pre-release)
- **API contract:** [ts-rest](https://ts-rest.com/) — a typed route contract shared between server and client, enforced at compile time
- **Package manager:** pnpm 11 with workspaces
- **Deployment:** Docker, with a root `compose.yaml` for local development

## Repository structure

```
apps/
  discord-bot/        — NestJS Discord bot; currently the only deployed app

packages/
  db/                 — Drizzle schema + migrations; the only package that
                        imports directly from the database driver
  api-contract/       — ts-rest contract defining all endpoints with request
                        and response types; imported by both api-server and api-client
  api-server/         — NestJS services and modules implementing the api-contract;
                        uses packages/db and packages/import; consumed directly
                        by discord-bot and (in future) a standalone API app
  api-client/         — ts-rest typed client for calling a deployed api-server
                        over HTTP; used by import tools
  import/             — pure import and ingestion logic; no knowledge of HTTP or
                        the database; called by api-server or directly from discord-bot

tools/
  import-<source>/    — one tool per upstream data source; uses api-client to POST
                        extracted data to a running api-server instance
```

## Data flow

- `apps/discord-bot` imports `packages/api-server` and `packages/import` directly — no HTTP hop
- `tools/import-*` import `packages/api-client` and call a deployed `api-server` over HTTP
- `packages/api-server` imports both `packages/db` (for persistence) and `packages/import` (for ingestion logic)
- `packages/import` has no dependencies on db or api layers — it is pure transformation and validation logic

## Key decisions

**Drizzle in its own package.** The pre-release Drizzle dependency is isolated to `packages/db`, so the risk of breaking changes is contained to one place.

**ts-rest over plain shared types.** A plain `api-types` package would allow server and client to drift silently. ts-rest makes both sides implement the same contract, with TypeScript errors if they diverge.

**api-server as a package, not an app.** Initially the Discord bot is the only deployment target, so the backend logic lives in a package it consumes directly. When a standalone REST API is needed, a thin `apps/api` wrapper around `packages/api-server` can be added without restructuring.

**One import tool per source.** Importing data from different upstream applications requires different extraction and transformation logic. Separate tools keep each integration self-contained.

## Docker

Each app in `apps/` has its own `Dockerfile`. The root `compose.yaml` defines services for PostgreSQL and each app, enabling a full local environment with a single `docker compose up`.
