# Production hosting

The production Discord bot runs as a single always-on container on
[Fly.io](https://fly.io/), backed by a managed PostgreSQL database on
[Neon](https://neon.tech/). This page covers the hosting setup itself: what
exists where, how configuration reaches the running app, and how to check
on or roll back a deployment.

For setting the bot up on the Discord side (application, token, invite,
channel ids), see [the Discord Bot page](index.md).

## What is deployed where

| Thing | Value |
|-------|-------|
| Fly app | `blood-bowl-tracker-discord-bot` |
| Fly region | `arn` (Stockholm) |
| Fly VM | one `shared-cpu-1x` machine, 256 MB, always on |
| Neon project | `blood-bowl-tracker` |
| Neon region | `eu-central-1` (Frankfurt) |

Both regions are chosen for proximity to the bot's users, who are all in
Sweden. Fly has a Stockholm region directly; `eu-central-1` (Frankfurt) is
Neon's closest available region.

The Fly configuration lives in `fly.toml` at the repository root. It sits
at the root rather than in `apps/discord-bot/` because Fly uses the
directory containing `fly.toml` as the Docker build context, and
`apps/discord-bot/Dockerfile` builds from the monorepo root — the same
context `docker-compose.yml` uses.

The machine never scales to zero (`auto_stop_machines = "off"`,
`min_machines_running = 1`). Unlike a stateless web app, the bot holds a
persistent connection to Discord's gateway, so a stopped machine is an
offline bot, not a cold start.

Nothing is published to the public internet: `fly.toml` declares the
service's internal port 3000 and a TCP health check against it, but no
public ports. Making the `/rpc` API reachable for the import tools is
tracked separately.

There is no redundancy, failover, or autoscaling. For a low-traffic hobby
bot that is a deliberate non-goal, not an oversight.

## Configuration and secrets

Production values live in `apps/discord-bot/.env.production`, which is
git-ignored and never committed. It uses the same variables as local
development — see `apps/discord-bot/.env.example`, which documents both
files — plus `DATABASE_URL`.

Its values are an independent set, not a copy of your local `.env`: the
Discord token and channel ids point at the real production Discord
application and server, the `API_TOKEN_IMPORT_*` values are separate
production secrets, and the `RANDOM_INSIGHTS_*` tunables may be set
differently than locally.

`DATABASE_URL` is Neon's **direct** (non-pooled) connection string, not the
pooled PgBouncer variant Neon also offers. The bot is one long-lived
container maintaining its own connection pool through drizzle-orm, not a
burst of short-lived serverless invocations, so Neon's pooler has nothing
to add.

Push the file to Fly as secrets:

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

## First-time setup

Done once, by a developer with accounts on both providers:

1. Install `flyctl` and sign in:
   ```bash
   flyctl auth login
   ```
   (`flyctl auth signup` if you do not have a Fly account yet.)
2. Sign up for Neon, create a project named `blood-bowl-tracker` in region
   `eu-central-1`, and copy its **direct** connection string.
3. Create the Fly app:
   ```bash
   flyctl apps create blood-bowl-tracker-discord-bot
   ```
4. Create `apps/discord-bot/.env.production` and fill in every variable:
   the production `DISCORD_BOT_TOKEN`, the production channel ids, the
   `RANDOM_INSIGHTS_*` tunables, the `API_TOKEN_IMPORT_*` tokens, and
   `DATABASE_URL` set to the Neon string from step 2.
5. Push secrets and deploy:
   ```bash
   fly secrets import < apps/discord-bot/.env.production
   fly deploy
   ```
6. Verify (see below).

## Deploying

Deploys are manual for now — run from the repository root, where `fly.toml`
lives:

```bash
fly deploy
```

Fly builds `apps/discord-bot/Dockerfile` with the repo root as build
context, pushes the image, and replaces the running machine. Automating
repeatable deploys is tracked separately; there is deliberately no GitHub
Actions deploy workflow, so there is one place responsible for the deploy
mechanism rather than two parallel paths.

## Checking on the deployment

```bash
fly status    # should show exactly one machine in state "started"
fly logs      # live log stream from the running machine
```

A healthy startup shows the drizzle migrations applying (or nothing
pending), the bot logging in to Discord's gateway, and the startup insight
being posted to `STARTUP_MESSAGE_DISCORD_CHANNEL`.

Common failures and where they surface:

- **Missing or invalid configuration** — the bot is intentionally
  fail-fast, so a missing variable throws at startup (`DATABASE_URL is not
  configured`, and similar) and the machine crash-loops. `fly status` shows
  repeated restarts; `fly logs` shows the thrown error. Fix the value and
  re-run `fly secrets import`.
- **Database unreachable** — a wrong or pooled `DATABASE_URL`, or a
  suspended Neon project, shows as a connection error during migration in
  `fly logs`.
- **Bad image** — a failed build stops the `fly deploy` command itself,
  before anything is replaced; the previous machine keeps running.

## Rolling back

Fly retains release history, so a bad deploy is undone by redeploying a
previous release rather than by any tooling of ours:

```bash
fly releases              # list previous releases with their versions
fly deploy --image <image-ref-from-an-earlier-release>
```

`fly releases --json` shows the exact image reference for each release.
