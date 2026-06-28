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

- **`packages/api-client`** — ts-rest typed client for calling the api-server over HTTP
- **`packages/api-contract`** — ts-rest route contract shared between api-server and api-client
- **`packages/api-server`** — NestJS services and modules implementing the api-contract; consumed directly by apps
- **`packages/db`** — Drizzle ORM schema and migrations for PostgreSQL
- **`packages/import`** — shared import/ingestion result types used across import tools

### Tools

- **`tools/import-bbl`** — CLI tool for importing data from BBL (Blood Bowl Legend) exports into the tracker via the api-client

## Getting started

### Prerequisites

- [Claude Code](https://claude.ai/code) — the AI coding assistant used for development in this project
- [Superpowers plugin](https://www.claudepluginhub.com/plugins/obra-superpowers-2) — extends Claude Code with additional skills (`/brainstorm`, `/writing-plans`, etc.)

  Install it once with:
  ```bash
  npx claudepluginhub obra/superpowers --plugin superpowers
  ```

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
