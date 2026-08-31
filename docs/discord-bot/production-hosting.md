# Production hosting

The production Discord bot runs as two always-on containers on
[Fly.io](https://fly.io/) — one active, one standby — backed by a managed
PostgreSQL database on [Neon](https://neon.tech/). These pages cover the
hosting setup itself: what exists where, how configuration reaches the
running app, and how to check on or roll back a deployment.

For setting the bot up on the Discord side (application, token, invite,
channel ids), see [the Discord Bot page](index.md). For running a second,
isolated bot identity locally alongside this production deployment, see
[Local development bot identity](local-development.md).

- [Production topology and failover](production-topology.md) — what is
  deployed where, the active/standby leader election, and the startup message
- [Configuration and secrets](production-configuration.md) —
  `.env.production`, `fly secrets import`, and how production values differ
  from local ones
- [First-time setup](production-first-time-setup.md) — the one-off account,
  app, scaling, secret and deploy-token steps
- [Deploying](production-deploying.md) — the automatic GitHub Actions deploy
  and the manual escape hatches
- [Running import tools against production](production-imports.md) — the
  `flyctl proxy` tunnel and the production importer configs
- [Checking on the deployment](production-monitoring.md) — `fly status`,
  `fly logs`, a healthy startup, and common failures
- [Rolling back](production-rollback.md) — redeploying a previous release
- [Dropping and recreating the production database](production-database-reset.md)
  — the destructive reset path
