# backup-cli

`tools/backup-cli` is a NestJS CLI application that backs up the production
database to a private Cloudflare R2 bucket and manages the stored backups.
The scheduled GitHub Actions workflow `.github/workflows/backup-production.yml`
runs it, and `.github/workflows/verify-backup.yml` uses it to check the newest
backup after each scheduled or manually dispatched run of that workflow. A
backup taken by another workflow that calls `backup-production.yml` is not
verified automatically; such a caller must run verification itself. Developers can run it locally to list or fetch backups. For the
bucket, tokens, schedule and retention policy, see
[Database backups](../discord-bot/production-backups.md).

## Subcommands

| Subcommand                                    | Purpose                                                                                                                                                  |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create`                                      | `pg_dump --format=custom --no-owner` of the whole database, uploaded as `production/<UTC timestamp>.dump`; prints key, size and timestamp                |
| `list`                                        | Stored backups, newest first                                                                                                                             |
| `prune`                                       | Delete backups older than the retention window (default 30 days), never the newest one                                                                   |
| `download <destination-path> [<backup-key>]`  | Fetch the named backup, or the newest, to a new local file                                                                                               |
| `verify <target-database-url> [<backup-key>]` | Restore the named backup, or the newest, into an empty local database and sanity-check it; prints key, restored migration count and key-table row counts |

Behaviors worth knowing:

- The dump is a custom-format archive that keeps its ownership entries
  (`--no-owner` has no effect on archives), so restore it with
  `pg_restore --no-owner` when the target database has different roles.
- `create` dumps into a temporary directory and removes it afterwards,
  whether the backup succeeded or not.
- `prune` throws and deletes nothing if the upload time the bucket reports
  for any stored backup cannot be parsed. If a deletion fails part-way, the error
  names the failing key and the keys already deleted.
- `download` refuses to overwrite an existing destination file, and removes
  its partial file if the download fails.
- `verify` refuses any target whose host is not `localhost`, `127.0.0.1` or
  `::1`; there is no override. The target must be a fresh, empty, local
  database. The restore runs in a single transaction, so a failed restore
  leaves nothing behind. The target URL is an argument, never a setting.
- `verify` restores with
  `pg_restore --no-owner --no-privileges --exit-on-error --single-transaction`, so production's
  roles need not exist locally. A non-zero exit, or a restore taking over 30
  minutes, fails it. The target URL appears in every error with its password masked (`<password>`).
- `verify` then checks, with `psql`, that `drizzle.__drizzle_migrations` is
  non-empty and records exactly the oldest N migrations of this checkout's
  `packages/db/migrations` (a backup older than the checkout is fine; an
  unknown or skipped migration fails), and that `game_data.coaches`, `teams`,
  `players`, `matches` and `competitions` each have at least one row. A
  failure lists every failed check, not just the first.
- `verify` downloads into a temporary directory and removes it afterwards,
  whether verification succeeded or not.

## Running it

```bash
pnpm --filter "@blood-bowl-tracker/backup-cli..." run build
node tools/backup-cli/dist/main.js <subcommand>
```

On success, every subcommand prints JSON on stdout. On failure it prints
`{"error": ...}` on stderr and exits with status 1, like the repo's other
CLIs. `create` needs `pg_dump` on `PATH`, and `verify` needs `pg_restore` and
`psql`, each at the production server's major version or newer.

## Configuration

Settings come from the gitignored `tools/backup-cli/backup-cli-config.json5`,
which you copy from `backup-cli-config.example.json5`. Any setting can come
from an environment variable instead. A non-empty variable wins over the
file. Validation is per setting, so `list` never fails over a missing
database url that only `create` needs.

| Setting                      | Environment variable               | Needed by |
| ---------------------------- | ---------------------------------- | --------- |
| `storage.endpoint`           | `BACKUP_STORAGE_ENDPOINT`          | all       |
| `storage.bucket`             | `BACKUP_STORAGE_BUCKET`            | all       |
| `storage.accessKeyId`        | `BACKUP_STORAGE_ACCESS_KEY_ID`     | all       |
| `storage.secretAccessKey`    | `BACKUP_STORAGE_SECRET_ACCESS_KEY` | all       |
| `database.url`               | `BACKUP_DATABASE_URL`              | `create`  |
| `retentionDays` (default 30) | `BACKUP_RETENTION_DAYS`            | `prune`   |

Put the **read-only** R2 token in your local file. It is enough for `list`,
`download` and `verify`. `create` and `prune` need the write token, which only the
`production-backup` GitHub environment holds.

The file holds production credentials, so `sync-gitignored` never copies it
into a new worktree. Copy it by hand when you need it in a worktree.
`check-drift` still flags a worktree copy that differs from the main
checkout's.

## Development

```bash
pnpm --filter @blood-bowl-tracker/backup-cli run test        # unit tests with coverage
pnpm --filter @blood-bowl-tracker/backup-cli run test:watch  # unit tests in watch mode
pnpm --filter @blood-bowl-tracker/backup-cli run verify      # build + lint + typecheck + format + test
```
