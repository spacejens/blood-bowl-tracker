# backup-cli

`tools/backup-cli` is a NestJS CLI application that backs up the production
database to a private Cloudflare R2 bucket and manages the stored backups.
The scheduled GitHub Actions workflow `.github/workflows/backup-production.yml`
runs it, and `.github/workflows/verify-backup.yml` uses it to check the newest
backup after each successful scheduled or manually dispatched run of that
workflow; a failed or cancelled run triggers no verification. A backup taken
by another workflow that calls `backup-production.yml` is not verified
automatically; such a caller must run verification itself, as the deploy
workflow does before every deploy.
`.github/workflows/check-backup-freshness.yml` runs its `check-freshness`
subcommand daily, so a backup that silently stopped appearing is noticed.
CI's `migration-check` job in `.github/workflows/ci.yml` also runs `verify`,
restoring the newest backup so a pull request's migrations can be applied
to real data (see
[Migration check on pull requests](../discord-bot/production-backups.md#migration-check-on-pull-requests)).
Developers can run it locally to list or fetch backups, or to restore one
into their local development database. The `deploy-production` skill uses it
to restore a backup into production (see
[Restoring a backup into production](../discord-bot/production-restore.md)).
For the bucket, tokens, schedule and retention policy, see
[Database backups](../discord-bot/production-backups.md).

## Subcommands

| Subcommand                                                           | Purpose                                                                                                                                                          |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create`                                                             | `pg_dump --format=custom --no-owner` of the whole database, uploaded as `production/<UTC timestamp>.dump`; prints key, size and timestamp                        |
| `list`                                                               | Stored backups, newest first                                                                                                                                     |
| `prune`                                                              | Delete backups older than the retention window (default 30 days), never the newest one                                                                           |
| `check-freshness`                                                    | Fail unless the newest backup is at most `maxAgeHours` (default 36) hours old; prints key, upload time, age in hours and the limit                               |
| `download <destination-path> [<backup-key>]`                         | Fetch the named backup, or the newest, to a new local file                                                                                                       |
| `verify <target-database-url> [<backup-key>]`                        | Restore the named backup, or the newest, into an empty local database and sanity-check it; prints key, restored migration count and key-table row counts         |
| `restore [<backup-key>]`                                             | Replace the local development database (`localDatabase.url`) with the named backup, or the newest; prints key, restored migration count and key-table row counts |
| `restore-production [<backup-key>] [--dry-run] [--confirm <phrase>]` | Replace production's application schemas with the named backup in one transaction; `--dry-run` only inspects and reports, and checks the newest without a key    |

Behaviors worth knowing:

- The dump is a custom-format archive that keeps its ownership entries
  (`--no-owner` has no effect on archives), so restore it with
  `pg_restore --no-owner` when the target database has different roles.
- `create` dumps into a temporary directory and removes it afterwards,
  whether the backup succeeded or not.
- Every subcommand that reads the bucket's contents (`list`, `prune`,
  `check-freshness`, and the "newest backup" default of `download`, `verify`,
  `restore` and `restore-production`) sees only objects under `production/`
  whose key ends in `.dump`; any other object is neither listed, pruned nor
  counted towards freshness.
- `prune` throws and deletes nothing if the upload time the bucket reports
  for any stored backup cannot be parsed. If a deletion fails part-way, the error
  names the failing key and the keys already deleted.
- `check-freshness` fails when the bucket holds no backups, when any stored
  backup's upload time cannot be parsed, or when the newest backup is older
  than `maxAgeHours` (exactly at the limit passes; an upload time in the
  future passes too). The newest is picked by
  upload time. On success it prints
  `{ "key", "createdAt", "ageHours", "maxAgeHours" }`, with `ageHours`
  rounded to two decimals.
- `download` refuses to overwrite an existing destination file, and removes
  its partial file if the download fails.
- `verify` refuses any target whose host is not `localhost`, `127.0.0.1` or
  `::1`; there is no override. The target must be a fresh, empty, local
  database. The restore runs in a single transaction, so a failed restore
  leaves nothing behind. The target URL is an argument, never a setting.
- `verify` restores with
  `pg_restore --no-owner --no-privileges --exit-on-error --single-transaction`,
  so production's roles need not exist locally. A non-zero exit, or a restore
  taking over 30 minutes, fails it. The target URL appears in every error with
  its password masked (`<password>`).
- `verify` then checks, with `psql`, that `drizzle.__drizzle_migrations` is
  non-empty and records exactly the oldest N migrations of this checkout's
  `packages/db/migrations` (a backup older than the checkout is fine; an
  unknown or skipped migration fails), and that `game_data.coaches`, `teams`,
  `players`, `matches` and `competitions` each have at least one row. A
  failure lists every failed check, not just the first.
- `verify` downloads into a temporary directory and removes it afterwards,
  whether verification succeeded or not.
- `restore` replaces the database named by `localDatabase.url` (by default
  the docker-compose database) and applies the same localhost-only rule as
  `verify`, with no override: a URL carrying a `host` or `hostaddr` query
  parameter is refused too. Unlike `verify`, the target need not be empty.
- The libpq variables `PGHOSTADDR`, `PGHOST`, `PGSERVICE` and `PGSERVICEFILE`
  are removed from the environment the `psql` and `pg_restore` programs run
  in, so they cannot redirect a connection the guard judged local.
- `restore` downloads first, so a network or credential failure never
  touches existing data. It then drops every schema except `pg_*` and
  `information_schema` in one atomic statement and recreates an empty
  `public`; this also removes tables a branch's newer migrations added.
  Finally it restores with the same `pg_restore` flags as `verify`.
- The wipe and the restore are separate transactions: a restore that fails
  after the wipe leaves an empty database, and the error says so. Re-run
  `restore`. Errors name the target with its password masked.
- `restore` applies no migrations and checks nothing: it reports the
  backup's applied-migration count and the key tables' row counts. Pending
  migrations are applied by whatever next connects through `packages/db`,
  for example `docker compose restart discord-bot`, as `deploy-local`'s
  "Restore a database backup" action does.
- `restore` downloads into a temporary directory and removes it afterwards,
  whether the restore succeeded or not.
- `restore-production` reads production's `DATABASE_URL` from
  `apps/discord-bot/.env.production` of the checkout it runs in, through
  `tools/cli-shared`'s `ProductionEnvFileService` (parsed with dotenv, the
  same parser the bot uses; anything but a `postgres://` or `postgresql://`
  URL is refused), never from an argument or setting, and never prints it;
  errors show it with its password masked.
- A real `restore-production` run refuses, before reading or downloading
  anything, unless given both an explicit `<backup-key>` (it never defaults
  to the newest backup, which could be one that landed after you chose) and
  `--confirm blood-bowl-tracker-discord-bot` (the Fly app name). `--dry-run`
  and `--confirm` cannot be combined.
- `restore-production` downloads first, then inspects the archive without a
  database: it refuses a backup that creates any schema other than
  `game_data`, `discord_bot_usage`, `drizzle` and `public` (an archive never
  lists `public` as a schema, so in practice the first three), whose recorded
  migrations are not exactly the oldest N of this checkout's, or whose key
  tables are empty. It then connects to production, listing which key tables
  exist there, and counts their rows: a connection failure stops the run
  with nothing changed, but a missing key table or `game_data` schema only
  reports that table's count as `null`, so a damaged schema never blocks the
  restore meant to repair it. A dry run stops there and prints
  `{ "mode": "dry-run", "key", "backup": { "migrations", "tableRowCounts" }, "production": { "tableRowCounts" } }`;
  it writes nothing to production.
- A real run turns the archive into a SQL script
  (`pg_restore --no-owner --no-privileges --file=...`) and runs
  `psql --single-transaction --set=ON_ERROR_STOP=1` with the wipe of those
  four schemas (recreating an empty `public`) followed by the script. The
  wipe waits at most 60 seconds for each lock it needs
  (`SET LOCAL lock_timeout`, which applies per lock wait, not to the wipe as
  a whole), so a connection still holding one fails the run instead of
  hanging it. Any failure, including that lock wait or a timeout, rolls back
  both, so production is either fully restored or unchanged. Neon's own
  schemas are never touched. It prints
  `{ "mode": "restored", "key", "restoredMigrations", "tableRowCounts", "previousTableRowCounts" }`.
- `restore-production` applies no migrations: the bot's startup migrations
  apply anything newer than the backup when the machines start. It does not
  stop or start machines or take a safety backup either; the
  `deploy-production` skill does that around it.
- `restore-production` downloads and writes its scripts into a temporary
  directory and removes it afterwards, whether the run succeeded or not.

## Running it

```bash
pnpm --filter "@blood-bowl-tracker/backup-cli..." run build
node tools/backup-cli/dist/main.js <subcommand>
```

On success, every subcommand prints JSON on stdout. On failure it prints
`{"error": ...}` on stderr and exits with status 1, like the repo's other
CLIs. `create` needs `pg_dump` on `PATH`, and `verify`, `restore` and
`restore-production` need `pg_restore` and `psql`, each at the production
server's major version or newer.

## Configuration

Settings come from the gitignored `tools/backup-cli/backup-cli-config.json5`,
which you copy from `backup-cli-config.example.json5`. Any setting can come
from an environment variable instead. A non-empty variable wins over the
file. Validation is per setting, so `list` never fails over a missing
database url that only `create` needs.

The backup, verification and freshness workflows check the settings they
need before running the CLI and, if any is empty, fail naming the GitHub
environment to fix (see
[Database backups](../discord-bot/production-backups.md#missing-required-settings)).

| Setting                                                    | Environment variable               | Needed by         |
| ---------------------------------------------------------- | ---------------------------------- | ----------------- |
| `storage.endpoint`                                         | `BACKUP_STORAGE_ENDPOINT`          | all               |
| `storage.bucket`                                           | `BACKUP_STORAGE_BUCKET`            | all               |
| `storage.accessKeyId`                                      | `BACKUP_STORAGE_ACCESS_KEY_ID`     | all               |
| `storage.secretAccessKey`                                  | `BACKUP_STORAGE_SECRET_ACCESS_KEY` | all               |
| `database.url`                                             | `BACKUP_DATABASE_URL`              | `create`          |
| `localDatabase.url` (default: the docker-compose database) | `BACKUP_LOCAL_DATABASE_URL`        | `restore`         |
| `retentionDays` (default 30)                               | `BACKUP_RETENTION_DAYS`            | `prune`           |
| `maxAgeHours` (default 36)                                 | `BACKUP_MAX_AGE_HOURS`             | `check-freshness` |

Put the **read-only** R2 token in your local file. It is enough for `list`,
`check-freshness`, `download`, `verify`, `restore` and `restore-production`.
`create` and `prune` need the write token, which only the `production-backup`
GitHub environment holds. `restore-production` takes its database from
`apps/discord-bot/.env.production`, not from this file.

The file holds only the read-only token, so `sync-gitignored` copies it from
the main checkout into a new worktree like the other dev config, and
`check-drift` flags a worktree copy that differs from the main checkout's.
Never put the write token in a local file.

## Realistic data for tests

`restore` works against any local Postgres, not just the docker-compose one.
To run code against production-shaped data, point it at an existing local
database with the environment variable (the database is wiped first):

```bash
BACKUP_LOCAL_DATABASE_URL=postgres://postgres:postgres@localhost:5432/scratch \
  node tools/backup-cli/dist/main.js restore
```

Then connect through `packages/db`, which applies this checkout's pending
migrations on top of the backup.

## Development

```bash
pnpm --filter @blood-bowl-tracker/backup-cli run test        # unit tests with coverage
pnpm --filter @blood-bowl-tracker/backup-cli run test:watch  # unit tests in watch mode
pnpm --filter @blood-bowl-tracker/backup-cli run verify      # build + lint + typecheck + format + test
```
