# Database backups

See [Production hosting](production-hosting.md) for the other pages.

`.github/workflows/backup-production.yml` backs up the production Neon
database daily to a private Cloudflare R2 bucket, using
[backup-cli](../backup-cli/index.md). To restore one into production, see
[Restoring a backup into production](production-restore.md).

## Why R2

The repository is public, so GitHub artifacts and releases cannot hold the
dumps privately. R2 is S3-compatible, and its free tier charges no egress
fees. It is also independent of both Fly.io and Neon, so an outage or an
account problem at either one does not take the backups with it.

## Schedule and retention

- The workflow runs daily at 03:17 UTC. It also runs on manual dispatch and
  when another workflow calls it. Runs are serialized, and a running backup
  is never cancelled. GitHub keeps only one waiting run per workflow, so a
  third trigger replaces a run that is still waiting.
- Each run creates one backup named `production/<UTC timestamp>.dump`. It is
  a custom-format `pg_dump` of the whole database, all schemas included.
- After a successful backup, the run prunes backups older than **30 days**.
  If the backup failed, nothing is pruned.
- Pruning never deletes the newest backup. A wrong clock or a mistaken
  retention setting therefore cannot leave the bucket empty. Pruning also
  refuses to delete anything if the upload time the bucket reports for any
  stored backup cannot be parsed.
- A failed run fails the workflow and opens an alert issue (see
  [Alerts](#alerts)).

## Scheduling caveats

- GitHub runs scheduled workflows only from the default branch (`main`).
  Changes to the schedule take effect once merged.
- GitHub disables scheduled workflows after 60 days without repository
  activity. If backups stop appearing, check the Actions tab and re-enable
  the workflow there. This applies to the freshness check too, so a disabled
  schedule silences its alert as well.

## Verification

`.github/workflows/verify-backup.yml` checks that each new backup is
functional. It starts when a run of the backup workflow completes
successfully, whether that run was scheduled or manually dispatched. A backup
taken by another workflow that calls the backup workflow is **not** verified
automatically (a called workflow runs under its caller's name, so it does not
trigger this one); such a caller must run verification itself. The
verification workflow can also be started by hand, optionally for a named
backup key.

Verification restores the newest backup at the time it runs, which is normally
the one that triggered it.

The job starts a throwaway `postgres:18` service container, downloads the
newest backup (or the named one) with the **read-only** token, and runs
`backup-cli verify` against it. That restores the backup and checks that its
recorded migrations match `main`'s `packages/db/migrations` (older is fine,
unknown or skipped ones are not) and that the key game-data tables have rows.
See [backup-cli](../backup-cli/index.md#subcommands) for the details. A failed
check fails the run and opens an alert issue (see [Alerts](#alerts)).

Verification runs from `main`, so a backup taken just before a migration
merged still passes: it simply records fewer migrations than `main` has.

The verification job never sees the database URL and cannot delete backups:
its environment holds only the read-only token.

```bash
gh workflow run verify-backup.yml --ref main
gh workflow run verify-backup.yml --ref main -f backup-key=production/<timestamp>.dump
```

## Alerts

Three workflows open a GitHub issue, labeled `bug` and `backup-alert`, when
they fail, so a broken or missing backup is noticed before it is needed:

| Kind     | Raised when                                | Issue title                             |
| -------- | ------------------------------------------ | --------------------------------------- |
| `backup` | a scheduled or dispatched backup run fails | `Production backup failed`              |
| `verify` | a verification run fails                   | `Production backup verification failed` |
| `stale`  | a run of the daily freshness check fails   | `Newest production backup is stale`     |

- Each kind has at most one open issue. A further failure while it is open
  adds a comment linking the new failed run instead of opening a second one.
- The next successful run of the same workflow comments on the issue,
  linking that run, and closes it. A maintainer can also close an issue by
  hand; the next failure then opens a new one.
- Cancelled runs neither raise nor resolve an alert. Neither does a skipped
  verification (its backup run did not succeed): the backup's own alert
  covers that.
- The freshness check, `.github/workflows/check-backup-freshness.yml`, runs
  daily at 08:41 UTC and on manual dispatch. It runs
  `backup-cli check-freshness` with the read-only token from the
  `production-backup-verify` environment, and fails when there is no backup
  or the newest is older than **36 hours** (the daily backup plus one missed
  or delayed run). The limit is backup-cli's `maxAgeHours` setting
  (`BACKUP_MAX_AGE_HOURS`; see [backup-cli](../backup-cli/index.md#configuration)).
- Any failure raises the alert, including a missing setting or a network
  error, not only a bad backup. Read the linked run's log first.
- A backup taken by another workflow that calls `backup-production.yml`
  raises and resolves nothing: the caller owns that failure. The calling job
  must still grant `issues: write`, because a called workflow's jobs cannot
  have more permissions than their caller grants.
- Only the alert jobs, which run `dev-workflow-cli raise-alert` or
  `resolve-alert` (see [dev-workflow-cli](../dev-workflow-cli/index.md)),
  get `issues: write`. The backup, verification and freshness jobs keep
  read-only repository access.

### Acting on an alert

- **`backup`:** open the linked run. A "Check required settings" failure
  names what to fix (see [Missing required settings](#missing-required-settings)).
  Otherwise fix the cause, then [run a backup on demand](#running-a-backup-on-demand);
  its success closes the issue and starts a verification.
- **`verify`:** the newest backup may not restore. The run's log lists every
  failed check. Once the cause is fixed, re-run verification by hand (see
  [Verification](#verification)); its success closes the issue.
- **`stale`:** check that the backup workflow is still enabled and that its
  recent runs succeeded (see [Scheduling caveats](#scheduling-caveats)).
  Once a new backup exists, run the check by hand to close the issue:

  ```bash
  gh workflow run check-backup-freshness.yml --ref main
  ```

## Runner and tokens

The workflow runs on a GitHub-hosted, ephemeral runner and uses only the
**write** token. It installs the PostgreSQL client from the PostgreSQL apt
repository, because the runner image's client is older than Neon's server.
`pg_dump` must be at least the server's major version. The workflow pins it
with `POSTGRES_CLIENT_MAJOR_VERSION`, currently 18 to match production Neon
(PostgreSQL 18.6). Raise that value whenever Neon's major version goes past
it. The database URL appears in the `pg_dump` command line, so it is visible
in the process list of that ephemeral runner only.

## One-time setup

1. **Bucket.** In the Cloudflare dashboard, go to **R2 → Create bucket**.
   Choose a location hint near Neon's region (`eu-central-1`, so Western
   Europe). Leave public access **off**: R2 buckets are private unless it is
   enabled.
2. **Tokens.** In **R2 → Manage API tokens**, create two tokens, each scoped
   to this bucket only:
   - **Write** (**Object Read & Write**), for the workflow. `create` uploads
     and `prune` deletes, so this token can delete backups. Store it only in
     the GitHub environment below.
   - **Read-only** (**Object Read only**), for developers and for any CI job
     that only reads backups. If this credential leaks, it cannot delete
     anything.

   Each token shows its access key id and secret access key once only. The
   bucket's S3 endpoint is `https://<account-id>.r2.cloudflarestorage.com`.

3. **GitHub environment.** In **Settings → Environments → New environment**,
   create `production-backup` and restrict its deployment branches to `main`.
   Add these secrets:
   - `PRODUCTION_DATABASE_URL`: Neon's **direct** connection string, the same
     value as `DATABASE_URL` in
     [Configuration and secrets](production-configuration.md)
   - `BACKUP_STORAGE_WRITE_ACCESS_KEY_ID`
   - `BACKUP_STORAGE_WRITE_SECRET_ACCESS_KEY`

   Add these variables: `BACKUP_STORAGE_ENDPOINT` and `BACKUP_STORAGE_BUCKET`.

4. **Verification environment.** Create a second environment,
   `production-backup-verify`, also restricted to `main`. Add only the
   **read-only** token as secrets:
   - `BACKUP_STORAGE_READ_ACCESS_KEY_ID`
   - `BACKUP_STORAGE_READ_SECRET_ACCESS_KEY`

   Add the same `BACKUP_STORAGE_ENDPOINT` and `BACKUP_STORAGE_BUCKET`
   variables. Do not add the database URL or the write token here.

5. **First run.** Trigger the workflow by hand (see below) once the bucket and
   environment exist, then confirm that the log reports a non-zero
   `sizeBytes`. This is also the first real test of the PostgreSQL client
   install step. Its success then starts the verification workflow; confirm
   that run passes too.

### Missing required settings

Before running `backup-cli`, the backup, verification and freshness workflows
check that the settings they need are non-empty: the storage settings in all
three, plus the database URL in the backup workflow. If any is empty, the run fails with an error that names the
GitHub environment the job reads from (`production-backup` for the backup,
`production-backup-verify` for verification and the freshness check) and lists each empty setting by
its GitHub name, such as `vars.BACKUP_STORAGE_ENDPOINT` or
`secrets.BACKUP_STORAGE_READ_ACCESS_KEY_ID`. The error prints names only,
never values.

- **Every setting empty** means that environment was never filled in. Add its
  variables and secrets as in steps 3 and 4 above.
- The two environments are separate: filling in `production-backup` does not
  configure verification. Each needs its own `BACKUP_STORAGE_ENDPOINT` and
  `BACKUP_STORAGE_BUCKET` variables, plus its own token secrets.

## Running a backup on demand

```bash
gh workflow run backup-production.yml --ref main
gh run list --workflow backup-production.yml --limit 1
gh run watch <run-id>
```

Another workflow can run a backup and wait for it with
`uses: ./.github/workflows/backup-production.yml`. It can then read the new
backup's key from the `backup-key` output.
The calling job must grant `issues: write` (see [Alerts](#alerts)), and a
called backup raises no alert.

## Listing and downloading backups locally

To load a backup into your local development database instead, see the
[`restore` command](../backup-cli/index.md).

Put the **read-only** token, the endpoint and the bucket name in
`tools/backup-cli/backup-cli-config.json5` (see
[backup-cli](../backup-cli/index.md#configuration)), then run:

```bash
pnpm --filter "@blood-bowl-tracker/backup-cli..." run build
node tools/backup-cli/dist/main.js list
node tools/backup-cli/dist/main.js download ./latest.dump
```

`download` refuses to overwrite an existing file, so pick a new path.
