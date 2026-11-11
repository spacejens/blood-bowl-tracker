# db

`packages/db` holds the Drizzle ORM schema and the SQL migrations for the
tracker's PostgreSQL database. It is the only workspace that imports the
database driver (`drizzle-orm` and `postgres`) directly: every other workspace
reaches the database through what this package exports.

How migrations are generated and applied, how every table's history is
tracked, and how importers are re-run against the long-lived database are
described in [database.md](../database.md).

## Why Drizzle lives in its own package

The pre-release Drizzle dependency is isolated here, so the risk of breaking
changes is contained to one place.

- Every other workspace builds queries with the operators and types
  `packages/db` re-exports — and, in specs, the test-only ones on its
  `/test-helpers` subpath — rather than importing `drizzle-orm` itself.
- The boundary is enforced by an automated test, not convention alone:
  `packages/db/src/dependency-boundary.spec.ts` scans every workspace's
  `package.json` and fails if anything but `packages/db` declares
  `drizzle-orm` or `postgres`.
- `drizzle-orm` and `drizzle-kit` are pinned to one exact release-candidate
  version in `packages/db/package.json`, never a floating dist-tag such as
  `rc`. A new release candidate is then an explicit, reviewable version bump,
  never something a lockfile refresh in an unrelated PR pulls in silently.
  `renovate.json5` groups the two packages so they update together, restricts
  them to numbered releases (drizzle also publishes build-hash snapshots such
  as `1.0.0-rc.5-ab785fc`, which semver ranks above the numbered release they
  were built from), and never automerges them.

## Driver-facing helpers

The same driver-isolation reason keeps these here:

- **`AdvisoryLockService`** — leader election's session-scoped Postgres
  advisory lock. It needs its own `postgres.js` connection rather than
  drizzle's pool, and keeping it here is what lets `apps/discord-bot` declare
  no driver dependency at all. Its log messages are described in
  [logging](../logging/index.md#advisory-lock-messages).
- **`DbOrTx`** — a `Db` or a transaction handle.
- **`asBaseTable`** — the generic-table widening for `.from()` and `.insert()`.
- **`isUniqueViolationOn`** — the one classifier for a Postgres unique
  violation (SQLSTATE 23505) on a given table, unwrapped from drizzle's
  `DrizzleQueryError`. `packages/game-data` and `packages/discord-bot-usage`
  both use it to recover from concurrent-insert races, so the two can't
  classify the same error differently.

`mockDb`, the drizzle-chain mock every workspace's specs share, lives on the
`@blood-bowl-tracker/db/test-helpers` subpath; see
[Testing](../architecture.md#testing) for why it lives here.

## Dependencies

Its workspace dependencies are `packages/domain-enums` (for the Drizzle enums)
and `packages/logging` (for `AdvisoryLockService`'s error logging).

## Development

```bash
pnpm --filter @blood-bowl-tracker/db run test        # unit tests with coverage
pnpm --filter @blood-bowl-tracker/db run db:generate # generate a migration (see database.md)
pnpm --filter @blood-bowl-tracker/db run verify      # build + lint + typecheck + format + test
```
