# Production topology and failover

What runs where, and how the two machines elect an active one. See
[Production hosting](production-hosting.md) for the other pages.

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
tunnel; see [Running import tools against production](production-imports.md).

The two machines give redundancy and failover: a crash, a restart, or a
deploy that replaces one machine leaves the other to take over within one
retry interval. There is still no autoscaling and no multi-region
deployment — both are deliberate non-goals for a single-guild, low-traffic
bot. There is also no backup
strategy for the Neon database: production data is reproducible by re-running
the `tools/import-*` importers, so nothing here needs its own backups. This is
an emergency recovery option, not a routine one, though: each importer writes
one record at a time over the `flyctl proxy` tunnel (see
[Running import tools against production](production-imports.md)),
so a full re-import of the whole dataset takes considerably longer against
production than it does locally, and the bot serves stale or empty data for
that whole window.

## Active and standby

**A deployment that predates this section is still running as a single
machine.** Deploying new code never changes machine count on its own — Fly
just replaces the machine(s) that already exist. If `fly status` shows only
one machine, run `fly scale count 2` once (see
[First-time setup](production-first-time-setup.md) step 4 — the same command applies
whether the app is brand new or already running) to bring it up to the
2-machine setup this page describes.

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
seconds, doing nothing else. Setting `STANDBY_STARTUP_MESSAGE_ENABLED=false`
suppresses that message; the machine still stands by exactly as before. It is
enabled whenever the variable is unset.

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

Each machine posts a status embed when it starts, so it is clear at a glance
whether something new was deployed, rolled back, or merely restarted. The
title names the role; the description has one `Label: value` line per field
that resolved, then the commit message as its own paragraph below a blank
line:

```
Bot starting as active
────────────────────────
Machine: 148e123456
App: blood-bowl-tracker-discord-bot
Branch: main
Commit: abcdef1
Committed: 2026-08-30 14:05 UTC

Show team records on the standings page
```

| Field          | Source in production                                                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Machine id     | `FLY_MACHINE_ID`, injected by Fly                                                                                                                                     |
| App name       | `FLY_APP_NAME`, injected by Fly                                                                                                                                       |
| Branch         | `GIT_BRANCH` build arg, from `$GITHUB_REF_NAME`                                                                                                                       |
| Commit SHA     | `GIT_SHA` build arg, from `$GITHUB_SHA` (shown as the first 7 characters)                                                                                             |
| Commit time    | `GIT_COMMIT_TIMESTAMP` build arg, from `git log -1 --format=%cI` on the runner — the ISO-8601 committer date, rendered in UTC to the minute                         |
| Commit message | `GIT_COMMIT_MESSAGE` build arg, from `git log -1 --pretty=%B` on the runner — the merge commit's PR-title body line when there is one, otherwise its subject line; a separate paragraph, not a `Label: value` line |
| Active/standby | which side of the election this machine ended up on, shown in the title                                                                                               |

An unusually long commit message can push the assembled description past
Discord's length limit; `DeploymentInfoService` truncates it rather than
letting Discord reject the whole message.

The five `GIT_*` values are baked into the image by
`.github/workflows/deploy.yml` at build time, because `.dockerignore` excludes
`.git` — a running container has no way to discover its own commit. Locally,
the `deploy-local` skill exports the same five variables from the host
checkout, and a bare `pnpm start:dev` falls back to running `git rev-parse
HEAD` / `git branch --show-current` directly, plus `git log -1 --pretty=%B`
for the commit message, `git log -1 --format=%cI` for the commit timestamp,
and `git rev-parse HEAD^2` to detect a merge commit. Any field that cannot be
resolved is left off the embed rather than shown blank; none is required, and
none can fail startup.

This is the only message either machine posts on startup: the status embed
alone already answers "what is running right now."
