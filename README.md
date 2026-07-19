# blood-bowl-tracker

A set of tools for tracking Blood Bowl games, teams, and players.

New to the project? Start with the [glossary](docs/glossary.md), [spec conventions](docs/spec-conventions.md), and [architecture](docs/architecture.md).

## Repository structure

This is a pnpm monorepo with three top-level workspace folders:

| Folder | Purpose |
|--------|---------|
| `apps/` | Runnable applications deployed or distributed to end users |
| `docs/` | Specifications, glossary, and domain documentation |
| `packages/` | Shared library packages consumed by apps (not standalone) |
| `tools/` | Developer tooling and scripts not shipped as part of any app |

### Applications

- **`apps/discord-bot`** — NestJS-based Discord bot for interacting with the tracker

### Packages

- **`packages/api-client`** — NestJS module wrapping an oRPC RPC client for calling the api-server over the network
- **`packages/api-contract`** — oRPC contract (coaches.upsert, externalSystems.upsert) shared between api-server and api-client
- **`packages/api-server`** — Thin NestJS transport layer dispatching RPC calls into packages/game-data; hosted in-process by apps/discord-bot
- **`packages/db`** — Drizzle ORM schema and migrations for PostgreSQL
- **`packages/discord-client`** — NestJS module wrapping discord.js for connecting to Discord and posting messages
- **`packages/game-data`** — Server-side business logic and DB access for core game entities (coaches, external systems); used directly by api-server and available to other apps
- **`packages/import`** — NestJS module with shared import/ingestion result types, upsert-handling bookkeeping, and entity-specific import services (calling api-client) used across import tools
- **`packages/parse-tp`** — library package for reusable TP JSON-parsing logic, shared between `tools/import-tp` and `apps/discord-bot`

### Tools

- **`tools/import-bbl`** — NestJS CLI application for importing data from BBL (Blood Bowl Legend) exports into the tracker via the api-client
- **`tools/import-tp`** — NestJS CLI application for importing TP data into the tracker (see [docs/import-tp/index.md](docs/import-tp/index.md))
- **`tools/db-diagram/db-diagram.sh`** — generates a [SchemaSpy](https://schemaspy.org/) ER diagram and browsable schema docs for the local docker-compose database into `docs/schemaspy-output/` (run via `pnpm run db:diagram`; requires the stack to be running — start it with `deploy-local` or `docker compose up -d --build`)
- **`tools/eslint-rules`** — custom ESLint rules shared across the repo (currently `max-function-params`, imported directly by the root `eslint.config.ts`)

## Getting started

### Prerequisites

- [Claude Code](https://claude.ai/code) — the AI coding assistant used for development in this project
- [Superpowers plugin](https://www.claudepluginhub.com/plugins/obra-superpowers-2) — extends Claude Code with additional skills (`/brainstorm`, `/writing-plans`, etc.)

  Install it once with:
  ```bash
  npx claudepluginhub obra/superpowers --plugin superpowers
  ```
- *(optional)* [`rtk`](https://github.com/rtk-ai/rtk) — compresses shell command output (git, tests, linters) before it reaches Claude's context via a Claude Code hook, reducing token usage during development. Each developer opts in on their own machine:
  ```bash
  brew install rtk       # or: curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
  rtk init -g
  ```
  Restart Claude Code afterward for the hook to take effect.

### Dependencies

```bash
pnpm install          # install all workspace dependencies
pnpm build            # build all workspaces
pnpm test             # run tests across all workspaces
```

To work within a specific workspace:

```bash
cd apps/discord-bot
pnpm run start:dev    # dev server with watch mode
pnpm run test         # unit tests
pnpm run test:e2e     # e2e tests
```

### Running with Docker Compose

> **Note:** The Docker Compose setup is intended for local development and testing of the production build. The Docker images themselves are designed for future production/public deployment — the Compose file is just a convenient way to run them locally.

`docker-compose.yml` defines two services:

| Service | Description |
|---------|-------------|
| `discord-bot` | The NestJS application, built from `Dockerfile` |
| `postgres` | PostgreSQL 17 database with a named volume for persistence |

The bot waits for the database to be healthy before starting. Default credentials and database name are `blood_bowl` and are intended for local use only; override them via environment variables for any other deployment.

```bash
docker compose up --build   # build and start both services
docker compose down         # stop and remove containers (data volume preserved)
docker compose down -v      # also remove the postgres data volume
```

The HTTP API is available at `http://localhost:3000` once the services are up.

The database is exposed on host port 5433 (not 5432, to avoid conflicts with any local Postgres installation). Connect with `psql`:

```bash
psql postgres://blood_bowl:blood_bowl@localhost:5433/blood_bowl
```

### Development workflow

Features are developed using the `develop-feature` Claude skill — see [docs/development-workflow.md](docs/development-workflow.md) for the full process.
