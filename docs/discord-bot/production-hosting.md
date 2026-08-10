# Production hosting

The production Discord bot runs as two always-on containers on
[Fly.io](https://fly.io/) — one active, one standby —, backed by a managed PostgreSQL database on
[Neon](https://neon.tech/). This page covers the hosting setup itself: what
exists where, how configuration reaches the running app, and how to check
on or roll back a deployment.

For setting the bot up on the Discord side (application, token, invite,
channel ids), see [the Discord Bot page](index.md). For running a second,
isolated bot identity locally alongside this production deployment, see
[Local development bot identity](local-development.md).

## What is deployed where

| Thing        | Value                                                                          |
| ------------ | ------------------------------------------------------------------------------ |
| Fly app      | `blood-bowl-tracker-discord-bot`                                               |
| Fly region   | `arn` (Stockholm)                                                              |
| Fly VM       | two `shared-cpu-1x` machines, 256 MB each, always on (one active, one standby) |
| Neon project | `blood-bowl-tracker`                                                           |
| Neon region  | `eu-central-1` (Frankfurt)                                                     |

Both regions are chosen for proximity to the bot's users, who are all in
Sweden. Fly has a Stockholm region directly; `eu-central-1` (Frankfurt) is
Neon's closest available region.

The Fly configuration lives in `fly.toml` at the repository root. It sits
at the root rather than in `apps/discord-bot/` because Fly uses the
directory containing `fly.toml` as the Docker build context, and
`apps/discord-bot/Dockerfile` builds from the monorepo root — the same
context `docker-compose.yml` uses.

The machines never scale to zero. `fly.toml` declares no `[[services]]` block
(see below), and Fly's autostop/autostart machinery only acts on machines
behind a declared service — with none declared, there is nothing for it to
stop, so both machines simply keep running once started. Unlike a
stateless web app, the bot holds a persistent connection to Discord's
gateway, so a stopped machine is an offline bot, not a cold start.

The app has a `.fly.dev` hostname, but nothing answers on it. `fly.toml`
declares no `[[services]]` block at all — only a top-level `[checks.tcp]`
health check against port 3000 — so no port is published to the public
internet. The `/rpc` API is reached instead through a private `flyctl proxy`
tunnel; see [Running import tools against production](#running-import-tools-against-production).

The two machines give redundancy and failover: a crash, a restart, or a
deploy that replaces one machine leaves the other to take over within one
retry interval. There is still no autoscaling and no multi-region
deployment — both are deliberate non-goals for a single-guild, low-traffic
bot. There is also no backup
strategy for the Neon database: production data is reproducible by re-running
the `tools/import-*` importers, so nothing here needs its own backups. This is
an emergency recovery option, not a routine one, though: each importer writes
one record at a time over the `flyctl proxy` tunnel (see
[Running import tools against production](#running-import-tools-against-production)),
so a full re-import of the whole dataset takes considerably longer against
production than it does locally, and the bot serves stale or empty data for
that whole window.

## Active and standby

Both machines run the same image, and both start their HTTP/RPC server
immediately — the TCP health check and the `flyctl proxy` import endpoint are
live on both at all times, regardless of which one is active.

What they do _not_ both do is talk to Discord. Discord delivers every gateway
event to every connected session of an unsharded bot, so two live sessions
would both receive the same slash-command interaction and race to answer it
(one succeeds, one fails with "interaction already acknowledged"), and both
would post the scheduled random insight.

The machines therefore elect a leader through a Postgres advisory lock on the
shared Neon database — no new infrastructure, since the bot is already
connected to it. Each machine opens one dedicated connection (separate from
drizzle's pool, because advisory locks are session-scoped) and calls
`pg_try_advisory_lock`. The winner:

1. connects to Discord's gateway,
2. registers the slash commands,
3. starts the `RANDOM_INSIGHTS_CRON` job,
4. posts its startup message.

The loser posts a standby startup message — a single plain REST call to
Discord's API, never a gateway session — and retries the lock every 15
seconds, doing nothing else.

**Failover** needs no heartbeat or timeout bookkeeping. If the active machine
crashes, is killed, or loses connectivity, its lock connection drops and
Postgres releases the lock immediately; the standby's next retry acquires it
and runs the same four steps. Its own startup message is the only signal that
a handover happened — there is no separate takeover message.

If an active machine loses its lock connection but keeps running (a transient
network blip), it treats that as fatal and exits rather than guessing whether
it is still the leader. Fly restarts it and it rejoins the election, normally
as the standby.

The implementation lives in `apps/discord-bot/src/leader-election/`.

### The startup message

Each machine posts a status line when it starts, so it is clear at a glance
whether something new was deployed, rolled back, or merely restarted:

```
Bot starting as **active** (machine 148e123456, app blood-bowl-tracker-discord-bot, branch main, commit abcdef1)
```

| Field          | Source in production                                                     |
| -------------- | ------------------------------------------------------------------------ |
| Machine id     | `FLY_MACHINE_ID`, injected by Fly                                        |
| App name       | `FLY_APP_NAME`, injected by Fly                                          |
| Branch         | `GIT_BRANCH` build arg, from `github.ref_name`                           |
| Commit SHA     | `GIT_SHA` build arg, from `github.sha` (shown as the first 7 characters) |
| Active/standby | which side of the election this machine ended up on                      |

The two `GIT_*` values are baked into the image by
`.github/workflows/deploy.yml` at build time, because `.dockerignore` excludes
`.git` — a running container has no way to discover its own commit. Locally,
the `deploy-local` skill exports the same two variables from the host
checkout, and a bare `pnpm start:dev` falls back to running
`git rev-parse HEAD` / `git branch --show-current` directly. Any field that
cannot be resolved is left out of the message; none is required, and none can
fail startup.

The active machine posts this line _and_ the usual unfiltered `stats` insight.
The standby posts only the line.

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

Write `.env.production` as plain `KEY=VALUE` lines with no surrounding
quotes — `fly secrets import` stores each value verbatim, so
`RANDOM_INSIGHTS_CRON="0 * * * *"` would push the literal quote characters
and make the bot fail to start on an invalid cron expression.

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
   (`flyctl auth signup` if you do not have a Fly account yet.) This opens a
   browser for OAuth, so it needs a real interactive terminal — it does not
   work from a non-interactive/headless shell.
2. Sign up for Neon, create a project named `blood-bowl-tracker` in region
   `eu-central-1`, and copy its **direct** connection string.
3. Fly requires billing info on file before it will create apps, even at
   this low usage tier. Add a card at
   `https://fly.io/dashboard/<your-org>/billing` if you have not already.
   Then create the Fly app:
   ```bash
   flyctl apps create blood-bowl-tracker-discord-bot
   ```
4. Scale to two machines:
   ```bash
   fly scale count 2
   ```
   Machine count is not a `fly.toml` field — like `flyctl apps create`, it is
   set imperatively, once. Deploys preserve the existing count, so this does
   not need repeating. See [Active and standby](#active-and-standby) for what
   the second machine does.
5. Create `apps/discord-bot/.env.production` and fill in every variable:
   the production `DISCORD_BOT_TOKEN`, the production channel ids, the
   `RANDOM_INSIGHTS_*` tunables, the `API_TOKEN_IMPORT_*` tokens, and
   `DATABASE_URL` set to the Neon string from step 2.
6. Push secrets and deploy:
   ```bash
   fly secrets import < apps/discord-bot/.env.production
   fly deploy
   ```
7. Create a Fly deploy token and store it as a GitHub Actions repository
   secret, so the deploy workflow can authenticate. Run from the repository
   root, where `fly.toml` names the app:

   ```bash
   fly tokens create deploy --name github-actions
   gh secret set FLY_API_TOKEN --app actions
   ```

   `fly tokens create deploy` prints the token on stdout; the leading
   `FlyV1 ` is part of the value, so paste the whole line when `gh secret
set` prompts for it. The token is scoped to deploying this one app, not
   to the whole Fly account. Adding the secret through the GitHub web UI
   (Settings → Secrets and variables → Actions) works equally well.

   This step stays manual on purpose. The `deploy-production` skill does not
   mint or store this credential: creating a deploy token is a rare,
   deliberate act, and a skill that did it silently would be handing itself
   the ability to deploy.

8. Verify (see below).

## Deploying

Deploys run automatically in GitHub Actions.
`.github/workflows/deploy.yml` triggers on every push to `main` — in
practice, every pull request merged with GitHub's merge-commit button — and
runs `flyctl deploy --remote-only` from the repository root, where
`fly.toml` lives. Fly builds `apps/discord-bot/Dockerfile` with the repo
root as build context on Fly's own builders, pushes the image, and replaces
the running machine.

The workflow authenticates with the `FLY_API_TOKEN` repository secret
created in [First-time setup](#first-time-setup). Its `deploy-production`
concurrency group deliberately does not cancel in-progress runs, so two
deploys queue rather than race — cancelling a deploy mid-flight can leave
the machine half-replaced.

Nothing about CI gates the deploy. `.github/workflows/ci.yml` runs on pull
requests, so lint, typecheck, and tests have already passed on the branch
before the merge that triggers a deploy.

The workflow also accepts `workflow_dispatch`, which redeploys the current
`main` without a new commit — useful after pushing changed secrets, or to
retry a deploy that failed for a transient reason:

```bash
gh workflow run deploy.yml --ref main
```

A manual `fly deploy` from a developer machine still works, and rolling
back uses it (see [Rolling back](#rolling-back)), but it is not the normal
path: whatever it deploys is replaced by the next merge to `main`.

For status checks, restarts, rollbacks, dispatching a redeploy, resetting
the database, and running the importers against production, use the
`deploy-production` skill (`.claude/skills/deploy-production/SKILL.md`),
which wraps the commands documented on this page.

## Running import tools against production

The `tools/import-*` importers write to the api-server hosted in-process by
the bot, and that server is not published to the internet. Reach it with a
private tunnel instead: `flyctl proxy` connects over Fly's WireGuard network
and forwards a local port to the machine, so nothing is ever exposed
publicly. This was chosen over publishing a TCP/HTTPS port (bearer-token auth
alone does not justify an unrestricted RPC surface on the open internet) and
over a persistent WireGuard peer via `flyctl wireguard create` (more standing
setup than an occasional, developer-initiated import run needs).

Because the tunnel listens on `localhost:3000`, an importer's production
`apiBaseUrl` is the same `http://localhost:3000` as its local-development
one — only the backend behind it differs. What must differ is the bearer
token: production `apiToken` values come from the `API_TOKEN_IMPORT_*`
secrets in `apps/discord-bot/.env.production`, not from the local `.env`.

Each importer therefore keeps a second, git-ignored config file next to its
default one:

| Tool                  | Local config                 | Production config                       |
| --------------------- | ---------------------------- | --------------------------------------- |
| `tools/import-bbl`    | `import-bbl-config.json5`    | `import-bbl-config.production.json5`    |
| `tools/import-tp`     | `import-tp-config.json5`     | `import-tp-config.production.json5`     |
| `tools/import-manual` | `import-manual-config.json5` | `import-manual-config.production.json5` |

Both variants share one committed template per tool — the existing
`import-*-config.example.json5`, copied twice — because the file shape is
identical and only the values differ. Setting `IMPORT_CONFIG_ENV=production`
for a run makes that tool read its `.production.json5` file; unset (or any
other value) reads the default one. This mirrors the
`.env` / `.env.production` split used for the bot itself.

To run an import against production:

1. Create the production config files once, from the same templates as the
   local ones, and fill in the production `apiToken` values:
   ```bash
   cp tools/import-bbl/import-bbl-config.example.json5 tools/import-bbl/import-bbl-config.production.json5
   cp tools/import-tp/import-tp-config.example.json5 tools/import-tp/import-tp-config.production.json5
   cp tools/import-manual/import-manual-config.example.json5 tools/import-manual/import-manual-config.production.json5
   ```
2. Build the tools:
   ```bash
   pnpm build
   ```
3. Open the tunnel in its own terminal, from the repository root where
   `fly.toml` lives, and leave it running:
   ```bash
   flyctl proxy 3000
   ```
4. In a second terminal, run the importers in the same order the
   `deploy-local` skill uses locally — manual "before", BBL, TP, manual
   "after" — each from its own tool directory:
   ```bash
   ( cd tools/import-manual && IMPORT_CONFIG_ENV=production node dist/main.js data/before-other-importers )
   ( cd tools/import-bbl    && IMPORT_CONFIG_ENV=production node dist/main.js )
   ( cd tools/import-tp     && IMPORT_CONFIG_ENV=production node dist/main.js )
   ( cd tools/import-manual && IMPORT_CONFIG_ENV=production node dist/main.js data/after-other-importers )
   ```
5. Stop the tunnel (Ctrl-C) when the imports are done.

Common failures:

- **`ECONNREFUSED` on `localhost:3000`** — the tunnel is not running, or it
  died. Check the `flyctl proxy` terminal. Note that a locally running
  docker-compose stack also binds port 3000; stop it before opening the
  tunnel, or the importer will silently write to the local database instead.
- **`401`** — the `apiToken` in the `.production.json5` file does not match
  the corresponding `API_TOKEN_IMPORT_*` secret pushed to Fly.
- **Wrong data imported** — `IMPORT_CONFIG_ENV` was not set (or was set in a
  different shell than the one that ran the tool), so the default config file
  was used.

The `deploy-production` skill automates this flow: it opens the tunnel,
runs the importers in the order above with `IMPORT_CONFIG_ENV=production`,
and closes the tunnel afterwards, in any combination of the four import
steps. It also checks first that nothing else holds port 3000, since a
running local stack there would silently take the writes instead.

The manual steps above stay documented because they are what the skill does
under the hood — which is what you need when an automated run fails partway
through. Step 1 in particular stays a human job: the skill checks that the
`.production.json5` files exist and syncs them into a worktree, but never
creates one, because a config generated from the example template would
carry a placeholder token and fail with `401`.

## Checking on the deployment

```bash
fly status    # should show two machines, both in state "started"
fly logs      # live log stream from both running machines
```

A healthy startup shows the drizzle migrations applying (or nothing pending)
on both machines, one machine logging `Acquired the leader lock; becoming
active`, that machine logging in to Discord's gateway and posting the active
startup message to `STARTUP_MESSAGE_DISCORD_CHANNEL`, and the other logging
`Another machine holds the leader lock; standing by` and posting the standby
message. `fly logs` interleaves both machines, prefixed by machine id.

Common failures and where they surface:

- **Missing or invalid configuration** — the bot is intentionally
  fail-fast, so a missing variable throws at startup (`DATABASE_URL is not
configured`, and similar) and the machine crash-loops. `fly status` shows
  repeated restarts; `fly logs` shows the thrown error. Fix the value and
  re-run `fly secrets import`. If the machine already hit Fly's max restart
  count (`fly status` shows `stopped` and `fly logs` shows "machine has
  reached its max restart count"), fixing the secret alone does not bring it
  back — explicitly restart it with
  `fly machine start <machine-id-from-fly-status>`.
- **Database unreachable** — a wrong or pooled `DATABASE_URL` shows as a
  connection error during migration in `fly logs`. Neon's free tier
  autosuspends its compute after a period of inactivity by design; the first
  connection after that incurs a brief cold-start delay while it resumes,
  which is normal and not itself a failure.
- **Bad image** — a failed build stops the `fly deploy` command itself,
  before anything is replaced; the previous machine keeps running.
- **Both machines standby, none active** — nothing is posted and slash
  commands go unanswered. Neither machine could take the advisory lock, which
  in practice means a third process holds it (a local bot pointed at the
  production database) or the lock connection cannot be opened at all;
  `fly logs` shows `Failed to reserve the advisory-lock connection` in the
  latter case.
- **A machine restarting after `Lost the leader lock while active`** — the
  active machine's dedicated lock connection dropped, which is fatal by
  design. A single occurrence is the intended reaction to a blip and the
  standby will already have taken over; a repeating loop points at the
  database dropping connections.

## Rolling back

Fly retains release history, so a bad deploy is undone by redeploying a
previous release rather than by any tooling of ours:

```bash
fly releases              # list previous releases with their versions
fly deploy --image <image-ref-from-an-earlier-release>
```

`fly releases --json` shows the exact image reference for each release.

This path wasn't exercised during the first deploy — there was no prior
release to roll back to — so treat it as documented but not yet proven in
practice.

The `deploy-production` skill automates this: it lists recent releases with
their image references, asks which one to roll back to, and runs the
`fly deploy --image` for you. Note that a rollback deploys from a developer
machine and so sits outside the GitHub Actions deploy path — the next merge
to `main` redeploys the newest code over it. A rollback buys time; the
offending change still has to be reverted or fixed on `main`.

## Dropping and recreating the production database

Production data is fully reproducible by re-running the importers, so the
recovery path for a corrupt or schema-drifted production database is to wipe
it and re-import rather than to restore a backup — there are no backups.
This is the production equivalent of `docker compose down -v` locally.

The mechanism is a schema drop against Neon followed by a machine restart:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -c 'DROP SCHEMA IF EXISTS public CASCADE;' \
  -c 'CREATE SCHEMA public;' \
  -c 'DROP SCHEMA IF EXISTS drizzle CASCADE;'
fly apps restart blood-bowl-tracker-discord-bot
```

`DATABASE_URL` is the direct Neon connection string from
`apps/discord-bot/.env.production` (see
[Configuration and secrets](#configuration-and-secrets)). The
`deploy-production` skill extracts this value itself and validates it looks
like a real `postgres://` connection string — stripping a dotenv-style quote
pair and a trailing CRLF first — before ever connecting, and aborts without
running `psql` if it doesn't; an empty or malformed value would otherwise let
`psql` silently fall back to a local connection instead of failing loudly.

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
[What is deployed where](#what-is-deployed-where)) and leaves the bot serving
empty data for that whole window.

The `deploy-production` skill automates this and gates it behind typing the
exact phrase `blood-bowl-tracker-discord-bot` — a button click is too easy to
make out of habit — then offers to chain straight into the production imports
described in
[Running import tools against production](#running-import-tools-against-production),
so production does not sit empty afterwards.
