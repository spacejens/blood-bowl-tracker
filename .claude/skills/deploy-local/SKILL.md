---
name: deploy-local
description: Use to build and start the blood-bowl-tracker stack locally via Docker Compose, restore a production database backup into it, and/or run the tools/import-bbl BBL data import or the tools/import-tp TP data import against a running instance, so a developer can see a change running end-to-end — invoked directly, or offered by develop-feature after a PR is created and by handle-pr-reviews after pushing fixes
---

# deploy-local

Builds and starts the full stack defined in `docker-compose.yml` (the `discord-bot` app and its `postgres` database), confirms both containers come up healthy, and reports how to inspect or tear down the deployment. Leaves containers running — this is a manual-inspection tool, not a one-shot smoke test.

## Invocation

```
/deploy-local
```

Takes no arguments.

## Steps

0. Ask the developer which action(s) to perform. There are now **eleven** actions and `AskUserQuestion` allows at most 4 options per question, so they are split across **three `multiSelect: true` questions sent in a single `AskUserQuestion` call** — the developer sees all three in sequence and answers once. Ask exactly these three questions, with exactly these options, in this order. Do not add, drop, reword, or reorder any option, and in particular do not add a "Both", "All", "None", or "Neither" option of your own invention — `multiSelect: true` already lets the developer pick any combination, including (by deselecting everything offered) none. See the `AskUserQuestion` option-ceiling and don't-invent-options rules in `CLAUDE.md`'s "Developer prompts" section for the rationale.

   All three questions are one decision split across three, so phrase them that way. The strings below are the `question` text; each also needs a short `header` of its own (`header` is capped at 12 characters, so the question text will not fit there) — e.g. `Run what`, `Run what 2`, and `Run what 3`.

   **Question 1 — `question`: "Which action(s) should I run?"** (`multiSelect: true`):
   - **Deploy the stack** (recommended) — build and start the docker-compose stack.
   - **Restore a database backup** — replace the local database with a production backup from the R2 bucket, instead of importing from scratch.
   - **Run the manual import (first batch)** — run `tools/import-manual/`'s `apply 001-initial-seed` command to apply the first batch of hand-authored data before the system-specific importers.
   - **Run the BBL import** — run `tools/import-bbl/` to import data into a running instance.

   **Question 2 — `question`: "Which action(s) should I run? (continued)"** (`multiSelect: true`):
   - **Run the TP import** — run `tools/import-tp/` to import data into a running instance.
   - **Run the manual import (remaining batches)** — run `tools/import-manual/`'s plain `apply` command to apply every batch not yet applied once the system-specific importers have run.
   - **Run the match-event review tool** — run `tools/review-match/` against the running database and the existing BBL/TP data directories, then open the report.

   **Question 3 — `question`: "Which action(s) should I run? (continued)"** (`multiSelect: true`):
   - **Run the player review tool** — run `tools/review-player/` against the running database and the existing BBL/TP data directories, then open the report.
   - **Run the race review tool** — run `tools/review-race/` against the running database and the existing BBL/TP/manual data directories, then open the report.
   - **Run the star player review tool** — run `tools/review-star-player/` against the running database and the existing BBL/TP/manual data directories, then open the report.
   - **Generate a SchemaSpy diagram** — run `pnpm run db:diagram` against a running `postgres` and open the result.

   The **union** of the three answers determines which sections below run; the split is purely a presentation constraint and carries no meaning of its own. The developer may select any combination of the eleven options, including none. No option is gated: "Generate a SchemaSpy diagram" is always offered, regardless of branch contents or whether `postgres` is currently running — the script's own precondition check handles the not-running case (see that section). If the union is empty (nothing selected in any question), report "No action taken" and stop — this is a valid outcome, not an error. This question always runs, regardless of who invoked this skill (directly, or as a sub-skill of `develop-feature` or `handle-pr-reviews`) — do not skip it because a caller already asked something similar.

### Sync gitignored config into the worktree

Run this once, before any of the selected sections below, whenever at least one action was selected in step 0. Skip it entirely when the union was empty.

The config and `.env` files these actions need — `apps/discord-bot/.env`, each importer's `*-config.json5`, `tools/review-match/review-match-config.json5`, `tools/review-player/review-player-config.json5`, `tools/review-race/review-race-config.json5`, `tools/review-star-player/review-star-player-config.json5`, `tools/backup-cli/backup-cli-config.json5` — and the large `tools/import-bbl/data` and `tools/import-tp/data` directories are all gitignored, so a git worktree created fresh from a branch won't have them even though the main checkout does. The same command also links `docs/plans` back to the main checkout (creating it there first if needed), so specs and plans survive worktree removal — this holds when the command is the one that creates the link; a worktree that already had its own `docs/plans` is left as-is, and files written there stay worktree-local. `develop-feature` normally performs this same sync in its Phase 1 at worktree-creation time, so in a worktree it created this is a no-op; it is kept here as a fallback for worktrees `develop-feature` did not create (e.g. a manual `git worktree add`, or an existing worktree from a prior session).

```bash
pnpm --filter @blood-bowl-tracker/fs-utils-cli run build
node tools/fs-utils-cli/dist/main.js sync-gitignored
```

The build is needed because a fresh worktree may only have run `pnpm install`, not `pnpm build`; if the build fails because dependencies are missing, run `pnpm install` first. The sync only fills in what is missing — it never overwrites a file or symlink already present, in case the developer deliberately set one up differently — and it is a no-op outside a worktree. It prints `{"copied": [...], "symlinked": [...], "skipped": [...]}`; report the counts and continue. The canonical lists live in `tools/cli-shared/src/gitignored-files.ts`, so a new tool's config is added there, not here.

The `data/` directories hold the actual BBL/TP downloads and can be very large, so they are symlinked, never copied. Because each importer's `dataDir` is typically a relative path resolved against its own working directory, the symlinked `data/` mirrors the main checkout's structure closely enough that an existing relative value keeps resolving correctly with no rewriting needed. `tools/review-match`, `tools/review-player`, `tools/review-race`, and `tools/review-star-player` need no `data/` symlink of their own — all four tools' configs point at `tools/import-bbl/data` and `tools/import-tp/data`, and review-race's and review-star-player's third source is `tools/import-manual/data`, which is tracked by git.

If a file is missing from the main checkout too, nothing is copied and the relevant section below handles it — `docker compose up` fails with its own clear "env file not found" error, and each importer section falls back to copying its committed `*-config.example.json5` template.

### Deploy the stack

Run this section only if "Deploy the stack" was selected in step 0 above.

1. Confirm `apps/discord-bot/.env` sets `API_TOKEN_IMPORT_BBL`, `API_TOKEN_IMPORT_TP`, and `API_TOKEN_IMPORT_MANUAL` to non-empty values that are not still the `.env.example` placeholders (`your-import-bbl-token-here`, etc.). If `apps/discord-bot/.env` does not exist at all after the shared sync section ran, say so and note that step 3's `docker compose up` will fail with its own "env file not found" error:
   ```bash
   grep -E '^API_TOKEN_IMPORT_(BBL|TP|MANUAL)=' apps/discord-bot/.env
   ```
   A `.env` missing one of these, or still carrying its placeholder value, does not fail at startup — the container comes up healthy and every `/rpc` call from the matching importer tool is rejected with `401` at request time instead. If any is missing or still a placeholder, tell the developer before proceeding — they need to set a value there and the matching `connection.apiToken` in that tool's config (see the importer sections below).
2. `docker-compose.yml` fixes both container names (`postgres`, `discord-bot`) rather than letting Compose namespace them per project — a stopped container left over from a previous run (in this checkout or any other clone/worktree of this repo) will collide on the name and make step 3 fail with "Conflict. The container name ... is already in use". Check for and clear that first:
   ```bash
   docker ps -a --filter "name=^postgres$" --filter "name=^discord-bot$" --format '{{.Names}}\t{{.Status}}'
   ```
   For each container listed as `Exited`, tell the developer you're removing it before starting fresh, then remove only those (naming just the `Exited` ones — passing a name that doesn't exist errors on "No such container"):
   ```bash
   docker rm <exited-container-name> [<other-exited-container-name>]
   ```
   (only removes the stopped containers — the named `postgres_data` volume and its data are untouched). If either is listed as anything other than `Exited` (i.e. already running), stop and report that to the developer instead of removing it — it may be a deployment they're actively using.
3. Export the checkout's commit identity so the image records which code it
   was built from, then build and start both services in the background:
   ```bash
   export GIT_SHA=$(git rev-parse HEAD)
   export GIT_BRANCH=$(git branch --show-current)
   export GIT_COMMIT_MESSAGE=$(git log -1 --pretty=%B)
   export GIT_COMMIT_TIMESTAMP=$(git log -1 --format=%cI)
   if git rev-parse --verify --quiet HEAD^2 >/dev/null; then
     export GIT_IS_MERGE_COMMIT=true
   else
     export GIT_IS_MERGE_COMMIT=false
   fi
   docker compose up -d --build
   ```
   All five variables feed `docker-compose.yml`'s build args and end up as env
   vars in the image, which the bot reports in its startup message. A detached
   HEAD makes `git branch --show-current` print nothing; that is fine — the
   startup message just omits the branch.
4. Poll container status until `postgres` reports healthy and `discord-bot` is `Up` (not `Restarting` or `Exited`):
   ```bash
   docker compose ps
   ```
   Retry every few seconds, up to a reasonable timeout (e.g. 60 seconds). If `discord-bot` is `Restarting` or `Exited`, or `postgres` never reports healthy within the timeout, stop and report the failure along with the relevant `docker compose logs <service>` output.
5. Confirm `discord-bot` connected successfully by checking its logs for the
   startup notifier's success line, with no fatal error logged first:
   ```bash
   docker compose logs discord-bot
   ```
   Look for `Acquired the leader lock; becoming active` followed by
   `Posted active startup message to channel`. If they're missing after the
   containers have been up for a few seconds, report what the logs show
   instead — this usually indicates a missing or invalid Discord token in
   `apps/discord-bot/.env`. A line reading
   `Another machine holds the leader lock; standing by` means a second
   instance is already running against the same database and holds the leader
   lock (see `docs/discord-bot/production-topology.md` on active/standby); stop
   that instance, or accept that this container is the standby.
6. Report to the developer:
   - Which containers are up and their health status.
   - The Postgres connection string for manual inspection: `postgres://blood_bowl:blood_bowl@localhost:5433/blood_bowl` (matches `docker-compose.yml`'s host port mapping).
   - The teardown command: `docker compose down` (add `-v` to also remove the Postgres data volume).
   - That containers are left running for manual inspection — this skill does not tear them down itself.

### Restore a database backup

Run this section only if "Restore a database backup" was selected in step 0 above. It runs after the "Deploy the stack" section (the `postgres` container must be up) and **before** every import and review section, because it replaces the whole local database — anything an importer wrote before it would be wiped. Selected without "Deploy the stack", it restores into the stack already running, once step 2 has confirmed that stack is this checkout's.

1. Confirm backup-cli has storage credentials — the file, or the `BACKUP_STORAGE_*` environment variables (checked by name only; never print their values):
   ```bash
   ls tools/backup-cli/backup-cli-config.json5 2>/dev/null || env | grep -c '^BACKUP_STORAGE_[A-Z_]*=.'
   ```
   If the file is missing and fewer than four `BACKUP_STORAGE_*` variables are set, tell the developer that the gitignored-config sync copies this file (it holds the read-only R2 token) from the main checkout, so the main checkout has none either; they need to create it there from `tools/backup-cli/backup-cli-config.example.json5` (or set the `BACKUP_STORAGE_*` variables) and re-run this action. Stop this section; the other selected sections still run.
2. If "Deploy the stack" was **not** selected, confirm the stack that is running belongs to this checkout. `docker-compose.yml` fixes the container names and the host port `5433`, so the default restore target is whichever compose project currently holds that port — possibly another worktree's, with its own database (the check below relies on `docker-compose.yml` having no top-level `name:`, so that each checkout gets its own compose project from its directory name):
   ```bash
   docker compose ps --status running --services
   ```
   Run from this worktree's root, which scopes the listing to this checkout's own compose project. If it does not list `postgres` and `discord-bot`, tell the developer that no stack from this checkout is running (any stack on port `5433` belongs to another checkout, and restoring into it would replace that database), suggest selecting "Deploy the stack" too, and stop this section; the other selected sections still run.
3. Resolve the effective restore target. The restore replaces the database `localDatabase.url` names, and a non-empty `BACKUP_LOCAL_DATABASE_URL` overrides that setting, so the stack check in step 2 only covers the default (this checkout's compose database, `postgres://blood_bowl:blood_bowl@localhost:5433/blood_bowl`). Check both overrides without printing the URLs, which can embed a password:
   ```bash
   env | grep -c '^BACKUP_LOCAL_DATABASE_URL=.'
   ```
   ```bash
   grep -c 'localDatabase' tools/backup-cli/backup-cli-config.json5
   ```
   If neither is set (the first prints `0` and the second prints `0` or the file is missing), the default applies; continue. Otherwise read the effective value (the environment variable wins over the file) and compare it with the default above. If it is the default, continue. If it names any other database, ask with `AskUserQuestion` (single-select, `header` `Target`), `question` "The restore target is overridden to <that URL with its password replaced by `<password>`>, which may not be this checkout's database. Restore into it anyway?", with the options **Restore into that database** and **Skip the restore**; on **Skip the restore**, stop this section; the other selected sections still run.
4. Build backup-cli — a fresh worktree only ran `pnpm install`:
   ```bash
   pnpm --filter "@blood-bowl-tracker/backup-cli..." run build
   ```
5. List the stored backups (newest first; each `{ key, sizeBytes, lastModified }`):
   ```bash
   node tools/backup-cli/dist/main.js list
   ```
   If the list is empty, report that there are no backups and stop this section. Otherwise ask with `AskUserQuestion` (single-select, `header` `Backup`), `question` "Which backup should I restore into the local database?". Options: **Newest backup** (recommended) first, its description giving the newest entry's full key, `lastModified` and size in MB; then one option per next most recent backup, up to three, each labelled with its `lastModified` timestamp and described by its full key and size (never truncate a key with "..."). The automatic "Other" entry lets the developer type any key.
6. Restore — always pass the full key the developer chose ("Newest backup" is the first entry of the list from step 5), so a backup that lands between listing and restoring cannot replace the one they saw:
   ```bash
   node tools/backup-cli/dist/main.js restore <backup-key>
   ```
   It downloads the backup, clears the database `localDatabase.url` names (default: the docker-compose database), restores, and prints `{ "key", "restoredMigrations", "tableRowCounts" }`. It needs `pg_restore` and `psql` on `PATH` at the production server's major version or newer; if they are missing or too old, say so (on macOS, Homebrew's `libpq` or `postgresql@<major>` provides them). On failure it prints `{"error": ...}` on stderr and exits `1`: a download or credential error leaves the database untouched, while an error saying the database "is now empty" means the wipe succeeded and the restore did not — tell the developer to re-run this action. An error starting "Restored <key> into ..., but reading the restored database back failed" is different: the data is restored and only the summary could not be read, so still run step 7 (the bot needs its restart to apply pending migrations), then report that error in step 8 without the counts. For any other failure, skip step 7, report the error, and continue with the other selected sections.
7. Restart the bot so it applies this branch's pending migrations to the restored data (a backup may be older than the branch), then confirm it came back healthy:
   ```bash
   docker compose restart discord-bot
   docker compose ps
   docker compose logs --tail 200 discord-bot
   ```
   Poll `docker compose ps` until `discord-bot` is `Up`, as in "Deploy the stack" step 4. In the logs from the restart, expect `Running migrations...`, one `Applying: <name>` line per migration newer than the backup, `Migrations complete.`, then the same leader-lock and startup-message lines as "Deploy the stack" step 5. A failed migration means the branch's migrations do not apply cleanly to production-shaped data — report it prominently.
8. Report the restored key, the backup's migration count, the key tables' row counts, which migrations the bot applied on top, and the bot's health. Do not tear down any containers — same non-goal as the "Deploy the stack" section.

### Run the manual import (first batch)

Run this section only if "Run the manual import (first batch)" was selected in step 0 above. Runs after the "Deploy the stack" and "Restore a database backup" sections if those were also selected; runs standalone (no docker steps at all) if only this was selected — e.g. the developer wants to seed hand-authored data into an already-running instance before the system-specific importers.

1. Check `tools/import-manual/import-manual-config.json5` is usable:
   ```bash
   cat tools/import-manual/import-manual-config.json5 2>/dev/null
   ```
   If the file doesn't exist, copy the template and confirm its `apiBaseUrl` and `apiToken` are not the example placeholders before running (an unchanged `apiToken` fails with a `401` from the api-server, not a config error, since the placeholder is a syntactically valid string):
   ```bash
   if [ ! -f tools/import-manual/import-manual-config.json5 ]; then
     cp tools/import-manual/import-manual-config.example.json5 tools/import-manual/import-manual-config.json5
   fi
   ```
   The `apiToken` value must also match `API_TOKEN_IMPORT_MANUAL` in `apps/discord-bot/.env` (see the "Deploy the stack" section's `.env` check above) — a valid-looking but mismatched token also fails with `401`.
2. Build and apply the first batch — a fresh worktree only ran `pnpm install` (no build) during setup, so `dist/` may not exist yet:
   ```bash
   pnpm --filter @blood-bowl-tracker/import-manual run build
   ( cd tools/import-manual && node dist/main.js apply 001-initial-seed )
   ```
3. Report the outcome to the developer. Per `tools/import-manual/src/main.ts`, the tool exits `0` and prints `Imported <N> record(s) successfully.` on stdout; or exits `1`, either printing per-error detail (`Import completed with <N> errors:` followed by each error message) on stderr for errors the import collected, or printing `Import failed:` with the thrown error for an unexpected failure (e.g. the API is unreachable, a malformed data file, or a missing directory). The tool also prints one `Skipped batch <name> (already applied).` or `Applied batch <name>.` line per batch; a failing batch is left unrecorded, with `Batch <name> was not recorded as applied; later batches were not attempted.` on stderr. `apply <batch>` refuses while a lower-numbered batch is unrecorded, and a failure prints a hint to apply the first batch, run the BBL and TP importers, then apply the rest. A restored production backup that predates batch tracking needs `node dist/main.js mark-applied 001-initial-seed 002-initial-cleanup` instead, which you offer to the developer rather than run unasked (only appropriate when the backup's last manual import ran from the current content of both batches, since `mark-applied` imports nothing; otherwise import those two batch directories by directory first). Report the exit code and the captured output either way. Because this import performs real database writes, a failure partway through may leave earlier steps' writes in place — there is no automatic rollback. Do not tear down any containers regardless of the import's outcome — same non-goal as the "Deploy the stack" section.

### Run the BBL import

Run this section only if "Run the BBL import" was selected in step 0 above. Runs after the "Deploy the stack", "Restore a database backup" and "Run the manual import (first batch)" sections if those were also selected; runs standalone (no docker steps at all) if only this was selected — e.g. the developer wants to import into an instance already deployed from a previous run.

1. Check `tools/import-bbl/import-bbl-config.json5` is usable:
   ```bash
   cat tools/import-bbl/import-bbl-config.json5 2>/dev/null
   ```
   If the file doesn't exist, doesn't set `dataDir`, still has the `import-bbl-config.example.json5` placeholder value (`dataDir: 'data/<subfolder>'`), or its value points to a folder that doesn't exist under `tools/import-bbl/`, ask the developer for the path to their BBL data download (per `docs/import-bbl/index.md`: "Ask the developer for the download if you don't have it"). Then write it into `import-bbl-config.json5`:
   ```bash
   if [ ! -f tools/import-bbl/import-bbl-config.json5 ]; then
     cp tools/import-bbl/import-bbl-config.example.json5 tools/import-bbl/import-bbl-config.json5
   fi
   ```
   followed by setting the `dataDir` field in that file to the path the developer gave, replacing the existing `dataDir:` value (a single flat quoted string, e.g. `dataDir: 'data/tloeg.bbleague.se',`).

   Also confirm `connection.apiToken` is not still the `import-bbl-config.example.json5` placeholder (`your-import-bbl-token-here`) and matches `API_TOKEN_IMPORT_BBL` in `apps/discord-bot/.env` (see the "Deploy the stack" section's `.env` check above) — an unchanged or mismatched value is syntactically valid and only surfaces as a `401` from the api-server at request time, not a config error.
2. Build and run the import — a fresh worktree only ran `pnpm install` (no build) during setup, so `dist/` may not exist yet:
   ```bash
   pnpm --filter @blood-bowl-tracker/import-bbl run build
   pnpm --filter @blood-bowl-tracker/import-bbl run start
   ```
3. Report the outcome to the developer. Per `tools/import-bbl/src/main.ts`, the tool exits `0` and prints a one-line success summary (`Imported <N> coach(es) successfully.`) on stdout; or exits `1`, either printing per-error detail (`Import completed with <N> errors:` followed by each error message) on stderr for errors the import collected, or printing `Import failed:` with the thrown error for an unexpected failure (e.g. the API is unreachable). Report the exit code and the captured output either way. Because this import performs real database writes, a failure partway through may leave earlier steps' writes in place — there is no automatic rollback. Do not tear down any containers regardless of the import's outcome — same non-goal as the "Deploy the stack" section.

### Run the TP import

Run this section only if "Run the TP import" was selected in step 0 above. Runs after the "Deploy the stack", "Restore a database backup" and "Run the BBL import" sections if those were also selected; runs standalone (no docker steps at all) if only this was selected.

1. Check `tools/import-tp/import-tp-config.json5` is usable:
   ```bash
   cat tools/import-tp/import-tp-config.json5 2>/dev/null
   ```
   If the file doesn't exist, or its `eras` array still has the `import-tp-config.example.json5` placeholder entry (`{ name: '<era name>', dataSubdir: '<era-slug>' }`), the tool will fail validation. In that case, list the actual era subdirectories present under `tools/import-tp/data/` (`ls tools/import-tp/data/`) and ask the developer to confirm the display name for each era slug found, per `docs/import-tp/index.md`. Then write the result into `import-tp-config.json5`:
   ```bash
   if [ ! -f tools/import-tp/import-tp-config.json5 ]; then
     cp tools/import-tp/import-tp-config.example.json5 tools/import-tp/import-tp-config.json5
   fi
   ```
   followed by setting the `eras` array in that file to the confirmed `{ name, dataSubdir }` entries.

   Also confirm `connection.apiToken` is not still the `import-tp-config.example.json5` placeholder (`your-import-tp-token-here`) and matches `API_TOKEN_IMPORT_TP` in `apps/discord-bot/.env` (see the "Deploy the stack" section's `.env` check above) — an unchanged or mismatched value is syntactically valid and only surfaces as a `401` from the api-server at request time, not a config error.
2. Build and run the import script — a fresh worktree only ran `pnpm install` (no build) during setup, so `dist/` may not exist yet:
   ```bash
   pnpm --filter @blood-bowl-tracker/import-tp run build
   ( cd tools/import-tp && node dist/main.js )
   ```
3. Report the outcome to the developer. Per `tools/import-tp/src/main.ts`, the tool exits `0` and prints a one-line success summary (`Imported <N> record(s) successfully.`) on stdout; or exits `1`, either printing per-error detail (`Import completed with <N> errors:` followed by each error message) on stderr for errors the import collected, or printing `Import failed:` with the thrown error for an unexpected failure (e.g. the API is unreachable). Report the exit code and the captured output either way. Because this import performs real database writes, a failure partway through may leave earlier steps' writes in place — there is no automatic rollback. Do not tear down any containers regardless of the import's outcome — same non-goal as the "Deploy the stack" section.

### Run the manual import (remaining batches)

Run this section only if "Run the manual import (remaining batches)" was selected in step 0 above. Runs after the "Deploy the stack", "Restore a database backup", "Run the manual import (first batch)", "Run the BBL import", and "Run the TP import" sections if those were also selected; runs standalone (no docker steps at all) if only this was selected — e.g. the developer wants to clean up names or attach external IDs after the system-specific importers already ran.

1. Check `tools/import-manual/import-manual-config.json5` is usable, copying the template if absent (identical to the "before" subsection's step 1).
2. Build and run the plain `apply` command, which applies every batch not yet applied, in number order:
   ```bash
   pnpm --filter @blood-bowl-tracker/import-manual run build
   ( cd tools/import-manual && node dist/main.js apply )
   ```
3. Report the outcome to the developer using the same success/error/`Import failed:` message formats as the "before" subsection's step 3. No automatic rollback; never tear down containers regardless of outcome.

### Run the match-event review tool

Run this section only if "Run the match-event review tool" was selected in step 0 above. Runs after the "Deploy the stack", "Restore a database backup" and every import section if those were also selected — the report reflects whatever is in the database at that point — and runs standalone (no docker steps of its own) if only this was selected.

1. Check `tools/review-match/review-match-config.json5` is usable:
   ```bash
   cat tools/review-match/review-match-config.json5 2>/dev/null
   ```
   If the file doesn't exist, copy the template:
   ```bash
   if [ ! -f tools/review-match/review-match-config.json5 ]; then
     cp tools/review-match/review-match-config.example.json5 tools/review-match/review-match-config.json5
   fi
   ```
   Then confirm, per `docs/review-match/index.md`, that `database.url` points at the running stack (`postgres://blood_bowl:blood_bowl@localhost:5433/blood_bowl` for the docker-compose stack) and that `bbl.dataDir` and `tp.dataDir` point at directories that exist — the template's defaults (`../import-bbl/data/tloeg.bbleague.se` and `../import-tp/data`) are correct whenever the BBL/TP sections' `data` symlinks are in place. If a `dataDir` doesn't exist, ask the developer for the right path and write it into the file before running.
2. Build and run the tool — a fresh worktree only ran `pnpm install` (no build) during setup, so `dist/` may not exist yet:
   ```bash
   pnpm --filter @blood-bowl-tracker/review-match run build
   pnpm --filter @blood-bowl-tracker/review-match run start
   ```
3. On success, open the report automatically — asking for the review is a request to look at it. Each run writes its own timestamped file under `tools/review-match/output/` rather than a fixed name, so open the exact path printed by step 2's command (the line reading `Reviewed <N> match(es); report written to <path>.`) — do not assume `report.html`:
   ```bash
   open <path from the tool's own output>
   ```
   Run this from the repo root (this worktree's root, not the main checkout's).
4. Report the outcome to the developer. Per `tools/review-match/src/main.ts`, the tool exits `0` and prints `Reviewed <N> match(es); report written to <path>.` on stdout, preceded by one `Warning [BBL|TP]: <reason>` line per gap (a stratum with no matching data, or an override id not in the database — neither is a failure); or exits `1` printing `Review failed:` with the thrown error (most often an unreachable database or an unusable config). Report the exit code, any warnings, and the report path. The tool only reads game data itself (it connects via `packages/db`'s `DbModule`, which applies any pending migrations on connect — a no-op against a stack deployed from the same branch), so a failure leaves nothing to clean up. Do not tear down any containers regardless of the outcome — same non-goal as the "Deploy the stack" section.

### Run the player review tool

Run this section only if "Run the player review tool" was selected in step 0 above. Runs after the "Deploy the stack", "Restore a database backup", every import section, and the "Run the match-event review tool" section if those were also selected — the report reflects whatever is in the database at that point — and runs standalone (no docker steps of its own) if only this was selected.

1. Check `tools/review-player/review-player-config.json5` is usable:
   ```bash
   cat tools/review-player/review-player-config.json5 2>/dev/null
   ```
   If the file doesn't exist, copy the template:
   ```bash
   if [ ! -f tools/review-player/review-player-config.json5 ]; then
     cp tools/review-player/review-player-config.example.json5 tools/review-player/review-player-config.json5
   fi
   ```
   Then confirm, per `docs/review-player/index.md`, that `database.url` points at the running stack (`postgres://blood_bowl:blood_bowl@localhost:5433/blood_bowl` for the docker-compose stack) and that `bbl.dataDir` and `tp.dataDir` point at directories that exist — the template's defaults (`../import-bbl/data/tloeg.bbleague.se` and `../import-tp/data`) are correct whenever the BBL/TP sections' `data` symlinks are in place. If a `dataDir` doesn't exist, ask the developer for the right path and write it into the file before running.
2. Build and run the tool — a fresh worktree only ran `pnpm install` (no build) during setup, so `dist/` may not exist yet:
   ```bash
   pnpm --filter @blood-bowl-tracker/review-player run build
   pnpm --filter @blood-bowl-tracker/review-player run start
   ```
3. On success, open the report automatically — asking for the review is a request to look at it. Each run writes its own timestamped file under `tools/review-player/output/` rather than a fixed name, so open the exact path printed by step 2's command (the line reading `Reviewed <N> player(s); report written to <path>.`) — do not assume `report.html`:
   ```bash
   open <path from the tool's own output>
   ```
   Run this from the repo root (this worktree's root, not the main checkout's).
4. Report the outcome to the developer. Per `tools/review-player/src/main.ts`, the tool exits `0` and prints `Reviewed <N> player(s); report written to <path>.` on stdout, preceded by one `Warning [BBL|TP]: <reason>` line per gap (a stratum with no matching data, or an override id not in the database — neither is a failure); or exits `1` printing `Review failed:` with the thrown error (most often an unreachable database or an unusable config). Report the exit code, any warnings, and the report path. The tool only reads game data itself (it connects via `packages/db`'s `DbModule`, which applies any pending migrations on connect — a no-op against a stack deployed from the same branch), so a failure leaves nothing to clean up. Do not tear down any containers regardless of the outcome — same non-goal as the "Deploy the stack" section.

### Run the race review tool

Run this section only if "Run the race review tool" was selected in step 0 above. Runs after the "Deploy the stack", "Restore a database backup", every import section, and the "Run the match-event review tool" and "Run the player review tool" sections if those were also selected — the report reflects whatever is in the database at that point — and runs standalone (no docker steps of its own) if only this was selected. It runs before the star player review tool because star player data depends on the races, eras and rules sets this tool covers.

1. Check `tools/review-race/review-race-config.json5` is usable:
   ```bash
   cat tools/review-race/review-race-config.json5 2>/dev/null
   ```
   If the file doesn't exist, copy the template:
   ```bash
   if [ ! -f tools/review-race/review-race-config.json5 ]; then
     cp tools/review-race/review-race-config.example.json5 tools/review-race/review-race-config.json5
   fi
   ```
   Then confirm, per `docs/review-race/index.md`, that `database.url` points at the running stack (`postgres://blood_bowl:blood_bowl@localhost:5433/blood_bowl` for the docker-compose stack) and that `bbl.dataDir`, `tp.dataDir` and `manual.dataDir` point at directories that exist — the template's defaults (`../import-bbl/data/tloeg.bbleague.se`, `../import-tp/data` and `../import-manual/data`) are correct whenever the BBL/TP sections' `data` symlinks are in place; `../import-manual/data` is tracked by git, so it is always present. If a `dataDir` doesn't exist, ask the developer for the right path and write it into the file before running.
2. Build and run the tool — a fresh worktree only ran `pnpm install` (no build) during setup, so `dist/` may not exist yet:
   ```bash
   pnpm --filter @blood-bowl-tracker/review-race run build
   pnpm --filter @blood-bowl-tracker/review-race run start
   ```
3. On success, open the report automatically — asking for the review is a request to look at it. Each run writes its own timestamped file under `tools/review-race/output/` rather than a fixed name, so open the exact path printed by step 2's command (the line reading `Reviewed <N> race(s); report written to <path>.`) — do not assume `report.html`:
   ```bash
   open <path from the tool's own output>
   ```
   Run this from the repo root (this worktree's root, not the main checkout's).
4. Report the outcome to the developer. Per `tools/review-race/src/main.ts`, the tool exits `0` and prints `Reviewed <N> race(s); report written to <path>.` on stdout, preceded by one `Warning [BBL|TP|MANUAL]: <reason>` line per gap (a stratum with no matching data, or an override that is not in the database — neither is a failure); or exits `1` printing `Review failed:` with the thrown error (most often an unreachable database or an unusable config). Report the exit code, any warnings, and the report path. The tool only reads game data itself (it connects via `packages/db`'s `DbModule`, which applies any pending migrations on connect — a no-op against a stack deployed from the same branch), so a failure leaves nothing to clean up. Do not tear down any containers regardless of the outcome — same non-goal as the "Deploy the stack" section.

### Run the star player review tool

Run this section only if "Run the star player review tool" was selected in step 0 above. Runs after the "Deploy the stack", "Restore a database backup", every import section, and the "Run the match-event review tool", "Run the player review tool" and "Run the race review tool" sections if those were also selected — the report reflects whatever is in the database at that point — and runs standalone (no docker steps of its own) if only this was selected. It runs last of the four review tools because star player data depends on the races, eras and rules sets the race review covers.

1. Check `tools/review-star-player/review-star-player-config.json5` is usable:
   ```bash
   cat tools/review-star-player/review-star-player-config.json5 2>/dev/null
   ```
   If the file doesn't exist, copy the template:
   ```bash
   if [ ! -f tools/review-star-player/review-star-player-config.json5 ]; then
     cp tools/review-star-player/review-star-player-config.example.json5 tools/review-star-player/review-star-player-config.json5
   fi
   ```
   Then confirm, per `docs/review-star-player/index.md`, that `database.url` points at the running stack (`postgres://blood_bowl:blood_bowl@localhost:5433/blood_bowl` for the docker-compose stack) and that `bbl.dataDir`, `tp.dataDir` and `manual.dataDir` point at directories that exist — the template's defaults (`../import-bbl/data/tloeg.bbleague.se`, `../import-tp/data` and `../import-manual/data`) are correct whenever the BBL/TP sections' `data` symlinks are in place; `../import-manual/data` is tracked by git, so it is always present. If a `dataDir` doesn't exist, ask the developer for the right path and write it into the file before running.
2. Build and run the tool — a fresh worktree only ran `pnpm install` (no build) during setup, so `dist/` may not exist yet:
   ```bash
   pnpm --filter @blood-bowl-tracker/review-star-player run build
   pnpm --filter @blood-bowl-tracker/review-star-player run start
   ```
3. On success, open the report automatically — asking for the review is a request to look at it. Each run writes its own timestamped file under `tools/review-star-player/output/` rather than a fixed name, so open the exact path printed by step 2's command (the line reading `Reviewed <N> star player(s); report written to <path>.`) — do not assume `report.html`:
   ```bash
   open <path from the tool's own output>
   ```
   Run this from the repo root (this worktree's root, not the main checkout's).
4. Report the outcome to the developer. Per `tools/review-star-player/src/main.ts`, the tool exits `0` and prints `Reviewed <N> star player(s); report written to <path>.` on stdout, preceded by one `Warning [BBL|TP|MANUAL]: <reason>` line per gap (a stratum with no matching data, or an override that is not in the database — neither is a failure); or exits `1` printing `Review failed:` with the thrown error (most often an unreachable database or an unusable config). Report the exit code, any warnings, and the report path. The tool only reads game data itself (it connects via `packages/db`'s `DbModule`, which applies any pending migrations on connect — a no-op against a stack deployed from the same branch), so a failure leaves nothing to clean up. Do not tear down any containers regardless of the outcome — same non-goal as the "Deploy the stack" section.

### Generate a SchemaSpy diagram

Run this section only if "Generate a SchemaSpy diagram" was selected in step 0 above. It runs **last** — after the "Deploy the stack", "Restore a database backup", both "Run the manual import" sections, "Run the BBL import", "Run the TP import", "Run the match-event review tool", "Run the player review tool", and "Run the race review tool" sections if those were also selected — so the diagram reflects the schema after any deploy work (it does not interact with any import). It also runs standalone (no docker steps of its own) if only this was selected — e.g. the developer wants a diagram of a stack deployed in a previous session.

1. Generate the diagram from the repo root:
   ```bash
   pnpm run db:diagram
   ```
2. If it fails, report the failure output to the developer and stop this section. The most common cause is `postgres` not running or not healthy; `tools/db-diagram/db-diagram.sh` already detects that and reports a clear, actionable error message. No extra pre-check is added here — the script's own precondition check is the safety net for the "asked for a diagram without deploying first" case.
3. On success, open the result automatically — asking for the diagram is a request to see it, not just to generate it:
   ```bash
   open docs/schemaspy-output/index.html
   ```
   Run this from the repo root (this worktree's root, not the main checkout's) so the relative path resolves to the copy `pnpm run db:diagram` just generated.
4. Report the output path (`docs/schemaspy-output/index.html`) to the developer.

## Non-goals

- No automated end-to-end smoke test — this is a manual-inspection tool, not a CI gate.
- No teardown — containers are left running until the developer runs `docker compose down` themselves.
