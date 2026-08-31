# Dropping and recreating the production database

See [Production hosting](production-hosting.md) for the other pages.

Production data is fully reproducible by re-running the importers, so the
recovery path for a corrupt or schema-drifted production database is to wipe
it and re-import rather than to restore a backup — there are no backups.
This is the production equivalent of `docker compose down -v` locally.

The mechanism is a schema drop against Neon followed by a machine restart.
`DATABASE_URL` is the direct Neon connection string from
`apps/discord-bot/.env.production` (see
[Configuration and secrets](production-configuration.md)). The
`deploy-production` skill extracts this value itself and validates it looks
like a real `postgres://` connection string — stripping a dotenv-style quote
pair and a trailing CRLF first — before ever connecting, and aborts without
running `psql` if it doesn't; an empty or malformed value would otherwise let
`psql` silently fall back to a local connection instead of failing loudly.
Doing this by hand instead of through the skill means reproducing the
essential part of that check — failing closed on an empty value instead of
letting `psql` silently fall back to a local connection — and failing closed
on any later step too:

```bash
DATABASE_URL="$(grep -E '^DATABASE_URL=' apps/discord-bot/.env.production | cut -d= -f2-)"
[ -n "$DATABASE_URL" ] || { echo "DATABASE_URL is empty" >&2; exit 1; }
psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 \
  -c 'DROP SCHEMA IF EXISTS game_data CASCADE;' \
  -c 'DROP SCHEMA IF EXISTS public CASCADE;' \
  -c 'CREATE SCHEMA public;' \
  -c 'DROP SCHEMA IF EXISTS drizzle CASCADE;' \
  && fly apps restart blood-bowl-tracker-discord-bot
```

`--single-transaction` wraps every `-c` above in one `BEGIN`/`COMMIT`, so a
later statement failing (with `ON_ERROR_STOP=1` set) rolls back the earlier
ones too, instead of leaving some schemas dropped and others not. The `&&`
matters as much as that: without it, a `psql` failure — including one
caused by an empty or malformed `DATABASE_URL` slipping past the check
above — would still let `fly apps restart` run against a database that was
never actually reset.

Both machines keep serving HTTP/RPC (and the active one keeps handling
Discord and scheduled work) until `fly apps restart` reaches them, so a
request made in the narrow window between the schema drop and that restart
completing can fail against a database with no schema at all. None of the
resulting failures crash or hang the bot, and most are visible rather than
silent:

- A Discord slash command run in the window replies with the generic
  `I am badly hurt` message — the same reply any other unhandled command
  error produces. `packages/discord-client/src/discord-client.service.ts`
  wraps every command handler invocation in a try/catch that logs the
  rejection and sends that reply. `DatabaseTimeoutService`
  (`apps/discord-bot/src/database-timeout.service.ts`) is a separate
  mechanism, for _slow_ queries (a 2s budget, inside Discord's ~3s ack
  window); a connection that rejects immediately never enters that timeout
  race and is caught by the outer try/catch instead.
- An RPC or import caller — for example an import tool connected over
  `flyctl proxy` — gets a generic error response.
  `packages/api-server/src/rpc.middleware.ts` logs any error that is not a
  recognized business error (`isDefinedError`) with its stack via
  `logger.error` and rethrows it, and oRPC turns that into the generic
  response the caller sees.
- Slash-command autocomplete (the suggestions shown while typing a
  command's options) is the one path that fails quietly: it has no
  try/catch of its own in `discord-client.service.ts`, so a rejected query
  only reaches the outer `Unhandled interaction error` log and the coach
  sees no suggestions, with no error message. This is still a
  known, logged failure rather than a hang — just one visible only in the
  logs, not to the user.
- The scheduled random-insight post (`RandomInsightsSchedulerService`) has
  its own try/catch around each run: a query failure during the window is
  logged and that run is skipped, with the next scheduled run trying again
  once the schema is back.

Encountering any of these during or shortly after a reset is expected,
already-sufficient error handling — not a bug to chase.

Quiescing both machines before the drop was investigated and rejected. A machine stopped before the drop and restarted before the
schema is recreated only serves an empty database, and one restarted after
adds nothing until the importers rerun — so quiescing would narrow the
failure window without avoiding it, at the cost of extra complexity in the
leader-election design. Downtime during a reset is an accepted cost of an
already-destructive, already-empty-afterward operation, not something the
steps below try to avoid.

All three schemas have to go, not just `public`. Application tables live in
`game_data` (see `packages/db/src/schema/pg-schema.ts`), not `public` —
`public` only holds the shared trigger functions (`versioning()`,
`set_updated_at()`) that `game_data`'s history-tracking triggers depend on.
Dropping `public` alone would remove those functions — and, by cascade, the
triggers on `game_data` tables that call them — without touching `game_data`
itself, leaving every table and all its data completely intact: not a reset
at all. Meanwhile drizzle-orm records which migrations have already run in
`drizzle.__drizzle_migrations`, in a schema of its own. Leaving `drizzle` in
place after dropping `game_data` would have that journal assert every
migration already applied against a database that no longer has any of
their effects, so the restart would rebuild nothing and leave an empty
database that the bot starts against perfectly happily — a silent failure
rather than a loud one.

The restart is what rebuilds the schema: `packages/db`'s `createDb` runs
drizzle's `migrate()` at startup before the app serves anything, exactly as
it does on a first deploy against an empty database. A successful reset
shows every migration applying in `fly logs`; "nothing pending" against a
freshly dropped database means the `drizzle` schema survived the drop.

This is destructive and has no undo. The only way back is a full re-import,
which takes considerably longer against production than it does locally (see
[What is deployed where](production-topology.md#what-is-deployed-where)) and leaves the bot serving
empty data for that whole window.

The `deploy-production` skill automates this and gates it behind typing the
exact phrase `blood-bowl-tracker-discord-bot` — a button click is too easy to
make out of habit — then offers to chain straight into the production imports
described in
[Running import tools against production](production-imports.md),
so production does not sit empty afterwards.
