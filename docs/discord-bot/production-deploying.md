# Deploying

See [Production hosting](production-hosting.md) for the other pages.

Deploys run automatically in GitHub Actions.
`.github/workflows/deploy.yml` triggers on every push to `main` — in
practice, every pull request merged with GitHub's merge-commit button. It
first takes and verifies a backup of the production database (see
[Backup before every deploy](#backup-before-every-deploy)), then runs
`flyctl deploy --remote-only` from the repository root, where
`fly.toml` lives. Fly builds `apps/discord-bot/Dockerfile` with the repo
root as build context on Fly's own builders, pushes the image, and replaces
both running machines, one at a time — see
[Active and standby](production-topology.md#active-and-standby) for what that overlap means for
which machine ends up active afterward.

The workflow authenticates with the `FLY_API_TOKEN` repository secret
created in [First-time setup](production-first-time-setup.md). Its `deploy-production`
concurrency group deliberately does not cancel in-progress runs, so two
deploys queue rather than race — cancelling a deploy mid-flight can leave
a machine half-replaced.

Nothing about CI gates the deploy. `.github/workflows/ci.yml` runs on pull
requests, so CI has already passed on the branch before the merge that
triggers a deploy.

The workflow also accepts `workflow_dispatch`, which redeploys the current
`main` without a new commit — useful after pushing changed secrets, or to
retry a deploy that failed for a transient reason:

```bash
gh workflow run deploy.yml --ref main
```

A manual `fly deploy` from a developer machine still works, and rolling
back uses it (see [Rolling back](production-rollback.md)), but it is not the normal
path: whatever it deploys is replaced by the next merge to `main`.

For status checks, applying configuration, restarts, rollbacks,
dispatching a redeploy, restoring a backup into production, and running the importers
against production, use the `deploy-production` skill
(`.claude/skills/deploy-production/SKILL.md`), which wraps the commands
documented on this page.

## Backup before every deploy

Bot startup applies migrations, and they only roll forward, so a release
that damages data cannot be undone by deploying the previous image. Every
deploy therefore runs three jobs in sequence:

1. `backup` calls `.github/workflows/backup-production.yml`, which takes a
   fresh backup of the production database.
2. `verify` calls `.github/workflows/verify-backup.yml` with that backup's
   key, restoring exactly that backup into a throwaway PostgreSQL and
   sanity-checking it (see
   [Verification](production-backups.md#verification)).
3. `deploy` runs the Fly deploy described above.

A push to `main` and a manual dispatch both take and verify a backup. The
verified backup is a known-good state to return to (see
[Restoring a backup into production](production-restore.md)). Backup and
verification together add a few minutes to a deploy; for this project, safe
backups matter more than release speed.

If the backup or its verification fails, the `deploy` job is skipped and
nothing is deployed, so there is nothing to roll back. The failed Deploy run
is the signal: called backup and verification runs raise no
[backup alert](production-backups.md#alerts). Fix the cause, then re-run the
failed run or dispatch the workflow as above. There is deliberately no input
that skips the backup or the verification: within the Deploy workflow, a
release that cannot be backed up and verified first waits until it can.
