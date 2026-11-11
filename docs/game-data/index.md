# game-data

`packages/game-data` is the server-side business logic and database access
for the core game entities: ingestion, and the reads that importers, the RPC
API and the Discord bot share. It is used directly, in-process, by
`packages/api-server`, `packages/import-tp-live` and `apps/discord-bot`.

## Rules

- **No network dependency.** It is pure business logic over `packages/db`, so
  any app can use it in-process without pulling in the network-transport
  layer. Its other workspace dependencies are `packages/api-contract`, for the
  shared contract shapes (the `Upsert*` types), and `packages/domain-enums`,
  for enum value types.
- **Server-side only.** Client-side tools never import it; they reach it
  through `packages/api-client` and the RPC API (see the
  [client/server boundary](../architecture.md#clientserver-boundary)).
- **Bot-only reads live elsewhere.** A read only `apps/discord-bot` uses
  belongs in [game-data-queries](../game-data-queries/index.md), which depends
  on this package one-way; this package never imports it. A read an importer
  or the API also needs stays here.
- **Concurrent inserts.** Entity services recover from concurrent-insert races
  with `packages/db`'s `isUniqueViolationOn` (see
  [db](../db/index.md#driver-facing-helpers)).

The generic helpers in `src/shared/` that take a table as a type parameter
are loose functions rather than services; see `CLAUDE.md`'s "Service vs. loose
function", case 1.

## Testing

`pnpm run test` runs the unit tests and then a real-Postgres integration
suite (`pnpm run test:e2e`), so a running Docker daemon is required:
`testcontainers` starts a throwaway Postgres container on a random port for
the run. It is deliberately not the docker-compose `postgres` service, whose
fixed container name only one worktree can hold at a time.

## Development

```bash
pnpm --filter @blood-bowl-tracker/game-data run test      # unit + integration tests (needs Docker)
pnpm --filter @blood-bowl-tracker/game-data run test:e2e  # integration tests only
pnpm --filter @blood-bowl-tracker/game-data run verify    # build + lint + typecheck + format + test
```
