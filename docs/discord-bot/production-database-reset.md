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
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -c 'DROP SCHEMA IF EXISTS public CASCADE;' \
  -c 'CREATE SCHEMA public;' \
  -c 'DROP SCHEMA IF EXISTS drizzle CASCADE;' \
  && fly apps restart blood-bowl-tracker-discord-bot
```

The `&&` matters as much as `ON_ERROR_STOP=1`: without it, a `psql` failure —
including one caused by an empty or malformed `DATABASE_URL` slipping past
the check above — would still let `fly apps restart` run against a database
that was never actually reset.

Both machines keep serving HTTP/RPC (and the active one keeps handling
Discord and scheduled work) until `fly apps restart` reaches them, so a
request made in the narrow window between the schema drop and that restart
completing can fail. This is an accepted cost of an already-destructive,
already-empty-afterward operation, not something the steps below try to
avoid.

Both schemas have to go. The application tables live in `public`, but
drizzle-orm records which migrations have already run in
`drizzle.__drizzle_migrations`, in a schema of its own. Dropping `public`
alone would leave that journal asserting every migration was applied, so the
restart would rebuild nothing and leave an empty database that the bot
starts against perfectly happily — a silent failure rather than a loud one.

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
