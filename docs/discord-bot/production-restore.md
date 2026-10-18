# Restoring a backup into production

See [Production hosting](production-hosting.md) for the other pages.

Production's daily [database backups](production-backups.md) can be restored
into the Neon database with `backup-cli restore-production`, wrapped by the
`deploy-production` skill's **Restore a backup into production** action. A
safety backup is taken first, both machines are stopped so nothing writes
mid-restore, and the restore itself is one transaction: it either replaces
all application data or changes nothing.

## When to use it

- Production data was damaged or deleted (a bad import, a bad migration, a
  mistaken manual change) and a recent backup is better than a full re-import.
- Undoing a restore: restore the safety backup it took, the same way.

A full re-import from the source data, through the
[production import runs](production-imports.md), is only a last resort for
a production database that has no usable backup at all. It cannot bring
back data the importers do not produce, such as the Discord bot's usage
records.

## What gets replaced

Only the application schemas, `game_data`, `discord_bot_usage`, `drizzle`
and `public`; the restore recreates `public`
empty before filling it from the backup (an archive never lists `public` as a
schema of its own). Neon's own schemas are never touched. Everything written
to production after the backup was taken is lost; the safety backup keeps it
recoverable.

The backup may be older than the deployed code. Its recorded migrations must
be exactly the oldest N of the checkout's `packages/db/migrations`, and the
bot's startup migrations apply the rest when the machines start again.

## The skill flow

Run `/deploy-production` from the **main checkout** and pick **Restore a
backup into production**. It refuses to run from a worktree. It needs
`fly` and `gh` authenticated, `apps/discord-bot/.env.production`, and
`tools/backup-cli/backup-cli-config.json5` holding the read-only storage
token (see [backup-cli configuration](../backup-cli/index.md#configuration)).

Wait for any deploy in flight to finish before starting, and pick a backup
well inside the 30-day retention window: the safety backup run also prunes
backups older than 30 days, which could delete a backup near the edge before
it is restored. It:

1. Checks `fly` and `gh` are authenticated and `apps/discord-bot/.env.production`
   sets `DATABASE_URL` (without printing it).
2. Lists the backups and asks which one to restore (default: the newest).
   A real restore always names the backup's key; it never defaults to the
   newest.
3. Runs `restore-production --dry-run` and shows the backup's migration count
   and key-table row counts beside production's current ones. A key table
   production lacks shows as `null`: the restore still goes ahead, since a
   damaged schema is one of the things it repairs. Only a failed connection
   stops it.
4. Asks you to type `blood-bowl-tracker-discord-bot` to confirm.
5. Stops both Fly machines.
6. Runs the backup workflow and waits for it: this is the safety backup, the
   exact state before the restore. If the workflow fails, the machines are
   started again and nothing is restored. It then dry-runs the safety backup
   to check it could be restored. That check is skipped when any of
   production's key tables was empty or missing, since such a backup is
   refused; the undo is then a re-import. If the check fails anyway (for
   example because production's migrations table was damaged), it shows the
   error and asks whether to continue without a restorable safety backup or
   stop and start the machines again.
7. Checks both machines are still stopped (a deploy may have started them),
   stopping them again if not, then runs
   `restore-production --confirm blood-bowl-tracker-discord-bot`. If it
   fails, production is unchanged; you can retry or start the machines.
8. Starts both machines; startup migrations apply anything newer than the
   backup. A machine a deploy already started is left running.
9. Checks whether a deploy ran while the machines were stopped (restarting
   them if so), then that both machines are healthy with one leader, the
   migration log lines, and the restored row counts against the dry run.
10. Reports the restored key, the safety backup's key and how to undo.

Do not merge to `main` while the machines are stopped: the deploy it
triggers starts them again. Renovate can merge too: dependency PRs it
automerges (`automerge: true` in `renovate.json5`) land on `main` with
nobody clicking merge. The skill checks afterwards for a deploy started
since the machines were stopped; if one ran, the bot may have written data
or applied migrations during the restore window, so it reports this and
restarts the machines against the restored data.

## Manual fallback

The same steps by hand, from the main checkout. `pg_restore` and `psql` must
be on `PATH`, at the production server's major version (18) or newer.

```bash
pnpm --filter "@blood-bowl-tracker/backup-cli..." run build
node tools/backup-cli/dist/main.js list
node tools/backup-cli/dist/main.js restore-production <backup-key> --dry-run
fly status --json
fly machine stop <first-machine-id>
fly machine stop <second-machine-id>
gh workflow run backup-production.yml --ref main
gh run list --workflow backup-production.yml --limit 1
gh run watch <run-id> --exit-status
node tools/backup-cli/dist/main.js list
node tools/backup-cli/dist/main.js restore-production <backup-key> --confirm blood-bowl-tracker-discord-bot
fly machine start <first-machine-id>
fly machine start <second-machine-id>
fly status
fly logs --no-tail
```

The newest key in the second `list` is the safety backup; note it before
restoring. Always pass the full key you chose, so a backup landing in between
cannot replace it.

## Rehearsing

`restore-production <backup-key> --dry-run` covers the download, the
inspection of the backup, and the read of production's row counts, but
writes nothing. It does not cover turning the backup into a restore script
or the restore transaction itself; the rehearsal below covers those. Run it
whenever you want to practise the path or check that a backup would be
accepted.

The single-transaction mechanism can be rehearsed against a throwaway local
Postgres, without production: dump a scratch database with
`pg_dump --format=custom`, turn it into a script with
`pg_restore --no-owner --no-privileges --file=restore.sql`, append a failing
statement such as `SELECT 1/0;`, and run it into a second database with:

```bash
psql --dbname=<local-url> --no-psqlrc --quiet --set=ON_ERROR_STOP=1 --single-transaction \
  "--command=DROP SCHEMA IF EXISTS game_data CASCADE; DROP SCHEMA IF EXISTS discord_bot_usage CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" \
  --file=restore.sql
```

`psql` prints notices and result tables even when it succeeds, so judge
the run by its exit code alone: non-zero (3 in this rehearsal) means it
failed and rolled back. The second database must be left exactly as it was;
without the failing statement it must end up holding the scratch data, with
any other schema untouched.

## Undo

The report names the safety backup's key. To undo the restore, run the same
action again and pick that key. That run takes its own safety backup first,
so it can be undone in turn.

When the safety backup's check was skipped or failed (step 6), the safety
backup cannot be restored this way, and the report says so: undoing the
restore means restoring an older backup or, with none usable, the
last-resort full re-import described under [When to use it](#when-to-use-it),
and whatever production held before the restore that neither reproduces is
lost.

## Failures

- **Storage or download failure, or a refused backup:** nothing was touched.
  Start the machines if they were already stopped.
- **The restore failed:** the transaction rolled back and production is as it
  was before the restore. Retry, or start the machines. This includes a
  `lock timeout`: the wipe waits at most 60 seconds for each lock held by
  another connection (the limit applies per lock wait), then gives up and
  rolls back, leaving production unchanged. Check both machines are really stopped before retrying.
- **The run was interrupted (Ctrl-C, a dropped session) and printed
  nothing:** production's state is unknown, since the transaction may or may
  not have committed. Keep the machines stopped and either retry the restore
  or restore the safety backup. An interrupted run can also leave a
  `backup-cli-restore-production-*` directory in the system temp directory
  holding production data; delete it.
- **"Restored ..., but reading the restored database back failed":** the
  data is in place; start the machines and check the row counts with a
  read-only query.
