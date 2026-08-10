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

The machine never scales to zero. `fly.toml` declares no `[[services]]` block
(see below), and Fly's autostop/autostart machinery only acts on machines
behind a declared service — with none declared, there is nothing for it to
stop, so the single machine simply keeps running once started. Unlike a
stateless web app, the bot holds a persistent connection to Discord's
gateway, so a stopped machine is an offline bot, not a cold start.

The app has a `.fly.dev` hostname, but nothing answers on it. `fly.toml`
declares no `[[services]]` block at all — only a top-level `[checks.tcp]`
health check against port 3000 — so no port is published to the public
internet. The `/rpc` API is reached instead through a private `flyctl proxy`
tunnel; see [Running import tools against production](#running-import-tools-against-production).

There is no redundancy, failover, or autoscaling. For a low-traffic hobby
bot that is a deliberate non-goal, not an oversight. There is also no backup
strategy for the Neon database: production data is reproducible by re-running
the `tools/import-*` importers, so nothing here needs its own backups. This is
an emergency recovery option, not a routine one, though: each importer writes
one record at a time over the `flyctl proxy` tunnel (see
[Running import tools against production](#running-import-tools-against-production)),
so a full re-import of the whole dataset takes considerably longer against
production than it does locally, and the bot serves stale or empty data for
that whole window.

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
4. Create `apps/discord-bot/.env.production` and fill in every variable:
   the production `DISCORD_BOT_TOKEN`, the production channel ids, the
   `RANDOM_INSIGHTS_*` tunables, the `API_TOKEN_IMPORT_*` tokens, and
   `DATABASE_URL` set to the Neon string from step 2.
5. Push secrets and deploy:
   ```bash
   fly secrets import < apps/discord-bot/.env.production
   fly deploy
   ```
6. Create a Fly deploy token and store it as a GitHub Actions repository
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
7. Verify (see below).

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

| Tool | Local config | Production config |
|------|--------------|-------------------|
| `tools/import-bbl` | `import-bbl-config.json5` | `import-bbl-config.production.json5` |
| `tools/import-tp` | `import-tp-config.json5` | `import-tp-config.production.json5` |
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

Automating this as a `deploy-production` skill is deliberately not done here.

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
