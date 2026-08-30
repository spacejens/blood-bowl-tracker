# Configuration and secrets

Production values live in `apps/discord-bot/.env.production`, which is
git-ignored and never committed. It uses the same variables as local
development — see `apps/discord-bot/.env.example`, which documents both
files — plus `DATABASE_URL`.

Its values are an independent set, not a copy of your local `.env`: the
Discord token and channel ids point at the real production Discord
application and server, the `API_TOKEN_IMPORT_*` values are separate
production secrets, and the `RANDOM_INSIGHTS_*` tunables are set for a live
audience rather than for development.

Concretely: `RANDOM_INSIGHTS_DISCORD_CHANNEL` in production points at a
channel dedicated to the bot's scheduled output for real server members,
distinct from the startup/status channel named by
`STARTUP_MESSAGE_DISCORD_CHANNEL` — the startup message is deployment noise
that members should not have to scroll past. `RANDOM_INSIGHTS_CRON` is
likewise lower-frequency than the hourly expression in the local template:
hourly exists for quick feedback while developing, whereas a channel people
actually read wants something closer to once a day (`0 8 * * *`). The
`RANDOM_INSIGHTS_FILTER_*` probabilities deserve the same second look — the
template's values were chosen for local iteration, not for a live audience.

`DATABASE_URL` is Neon's **direct** (non-pooled) connection string, not the
pooled PgBouncer variant Neon also offers. The bot is one long-lived
container maintaining its own connection pool through drizzle-orm, not a
burst of short-lived serverless invocations, so Neon's pooler has nothing
to add.

Write `.env.production` as plain `KEY=VALUE` lines with no surrounding
quotes — `fly secrets import` stores each value verbatim, so
`RANDOM_INSIGHTS_CRON="0 * * * *"` would push the literal quote characters
and make the bot fail to start on an invalid cron expression.

Push the file to Fly as secrets. The `deploy-production` skill automates
this via its "Apply production configuration" action (main checkout
only); the equivalent command by hand is:

```bash
fly secrets import < apps/discord-bot/.env.production
```

Fly stores these encrypted and injects them as environment variables.
Pushing secrets restarts the machine, so it also acts as a way to apply a
config change without a redeploy.

Non-secret settings (`NODE_ENV`, `PORT`) are in `fly.toml`'s `[env]` block
instead, since they are not sensitive and belong in version control.

No database migration step is needed. `packages/db`'s `createDb` runs
drizzle-orm's `migrate()` at startup before the app serves anything, so the
first deploy against an empty Neon database creates the whole schema by
itself.
