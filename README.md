# blood-bowl-tracker

A set of tools for tracking Blood Bowl games, teams, and players. It imports
league history from BBL and TP, plus hand-curated data, into one PostgreSQL
database, and serves statistics, toplists and deepdives about it through a
Discord bot.

New to the project? Start with the [glossary](docs/glossary.md),
[spec conventions](docs/spec-conventions.md), and
[architecture](docs/architecture.md), whose
[workspace index](docs/architecture.md#workspace-index) links every app,
package and tool to its own documentation.

## Applications

- **`apps/discord-bot`** — the Discord bot for interacting with the tracker
  (see [docs/discord-bot/index.md](docs/discord-bot/index.md)).

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

> **Note:** `packages/game-data`'s, `packages/game-data-queries`' and `tools/import-manual`'s `pnpm run test`
> run their unit tests and then a
> real-Postgres integration suite (`pnpm run test:e2e`), so a running Docker
> daemon is required — `testcontainers` starts a throwaway `postgres:18-alpine`
> on a random port for the run. It is deliberately not the docker-compose
> `postgres` service, whose fixed container name only one worktree can hold at a
> time.

### Running with Docker Compose

> **Note:** The Docker Compose setup is intended for local development and testing of the production build. The same image runs in production on Fly.io against a Neon database — see [docs/discord-bot/production-hosting.md](docs/discord-bot/production-hosting.md) — so the Compose file is just a convenient way to run it locally. Once production is running continuously, point your local `.env` at a separate Discord bot identity instead of production's — see [docs/discord-bot/local-development.md](docs/discord-bot/local-development.md).

`docker-compose.yml` defines a `discord-bot` service, built from `apps/discord-bot/Dockerfile`,
and a `postgres` service with a named volume for persistence. The bot waits
for the database to be healthy before starting. Default credentials and
database name are `blood_bowl` and are intended for local use only; override
them via environment variables for any other deployment.

```bash
docker compose up --build   # build and start both services
docker compose down         # stop and remove containers (data volume preserved)
docker compose down -v      # also remove the postgres data volume
```

The HTTP API is available at `http://localhost:3000` once the services are up.
The database is exposed on host port 5433 (not 5432, to avoid conflicts with
any local Postgres installation):

```bash
psql postgres://blood_bowl:blood_bowl@localhost:5433/blood_bowl
```

### Development workflow

Features are developed using the `implement` Claude skill — see [docs/development-workflow.md](docs/development-workflow.md) for the full process.
