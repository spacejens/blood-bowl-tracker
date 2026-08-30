# Deploying

Deploys run automatically in GitHub Actions.
`.github/workflows/deploy.yml` triggers on every push to `main` — in
practice, every pull request merged with GitHub's merge-commit button — and
runs `flyctl deploy --remote-only` from the repository root, where
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
dispatching a redeploy, resetting the database, and running the importers
against production, use the `deploy-production` skill
(`.claude/skills/deploy-production/SKILL.md`), which wraps the commands
documented on this page.
