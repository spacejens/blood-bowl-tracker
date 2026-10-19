# Rolling back

See [Production hosting](production-hosting.md) for the other pages.

Fly retains release history, so a bad deploy is undone by redeploying a
previous release rather than by any tooling of ours:

```bash
fly releases              # list previous releases with their versions
fly deploy --image <image-ref-from-an-earlier-release>
```

`fly releases --json` shows the exact image reference for each release.

The `deploy-production` skill automates this: it lists recent releases with
their image references, asks which one to roll back to, and runs the
`fly deploy --image` for you. Note that a rollback deploys from a developer
machine and so sits outside the GitHub Actions deploy path — the next merge
to `main` redeploys the newest code over it. A rollback buys time; the
offending change still has to be reverted or fixed on `main`.

Migrations are roll-forward only (see
[Migrations](../database.md#migrations)), and `packages/db`'s `createDb` runs
them at startup on every deploy — including a rollback. Rolling back to an
image older than the most recent schema migration starts that older code
against a newer schema it was never written against. Only roll back to a
release whose schema the current Neon database is still compatible with; for
anything older, fix forward instead of rolling back.

A Fly rollback undoes code only: it never reverts a migration or any other
change to the data. The backup the Deploy workflow takes before every deploy
(see
[Backup before every deploy](production-deploying.md#backup-before-every-deploy);
a manual `fly deploy` takes none) is the known-good state of the data. If a
deploy damaged data, recover it by
[restoring that backup](production-restore.md), not by rolling back or
re-importing. A restore replaces everything written since that backup (see
[What gets replaced](production-restore.md#what-gets-replaced)).

When the damage came from a migration, the backup predates it, so startup
applies that migration again when the restored machines start (see
[Restoring a backup into production](production-restore.md)). Restoring alone
does not recover this case: fix or replace the faulty migration on `main`
first, so the code that starts after the restore no longer runs it as written.
