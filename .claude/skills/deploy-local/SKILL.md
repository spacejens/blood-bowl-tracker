---
name: deploy-local
description: Use to build and start the blood-bowl-tracker stack locally via Docker Compose, and/or run the tools/import-bbl BBL data import against a running instance, so a developer can see a change running end-to-end — invoked directly, or offered by develop-feature after a PR is created and by handle-pr-reviews after pushing fixes
---

# deploy-local

Builds and starts the full stack defined in `docker-compose.yml` (the `discord-bot` app and its `postgres` database), confirms both containers come up healthy, and reports how to inspect or tear down the deployment. Leaves containers running — this is a manual-inspection tool, not a one-shot smoke test.

## Invocation

```
/deploy-local
```

Takes no arguments.

## Steps

0. Ask the developer which action(s) to perform, via a multi-select question with exactly these three options, in this order — do not add a "Both", "All", or "Neither" option of your own invention, since `multiSelect: true` already lets the developer pick any combination, including (by deselecting everything offered) none:
   - **Deploy the stack** (recommended) — build and start the docker-compose stack.
   - **Run the BBL import** — run `tools/import-bbl/` to import data into a running instance.
   - **Generate a SchemaSpy diagram** — run `pnpm run db:diagram` against a running `postgres` and open the result.

   The developer may select any combination of the three options above, including none. No option is gated: "Generate a SchemaSpy diagram" is always offered, regardless of branch contents or whether `postgres` is currently running — the script's own precondition check handles the not-running case (see that section). If nothing is selected, report "No action taken" and stop — this is a valid outcome, not an error. This question always runs, regardless of who invoked this skill (directly, or as a sub-skill of `develop-feature` or `handle-pr-reviews`) — do not skip it because a caller already asked something similar.

### Deploy the stack

Run this section only if "Deploy the stack" was selected above.

1. `.env` files `docker-compose.yml` needs (currently just `apps/discord-bot/.env`) are gitignored, so a git worktree created fresh from a branch won't have them even though the main checkout does. `develop-feature` now normally performs this same sync in its Phase 1 at worktree-creation time, so in a worktree it created this block is a no-op; it is kept here as a fallback for worktrees `develop-feature` did not create (e.g. a manual `git worktree add`, or an existing worktree from a prior session). If running from a worktree, fill in what's missing from the main checkout before building:
   ```bash
   MAIN_ROOT=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
   WORKTREE_ROOT=$(git rev-parse --show-toplevel)
   if [ "$MAIN_ROOT" != "$WORKTREE_ROOT" ]; then
     for env_file in apps/discord-bot/.env; do
       if [ ! -f "$WORKTREE_ROOT/$env_file" ] && [ -f "$MAIN_ROOT/$env_file" ]; then
         cp "$MAIN_ROOT/$env_file" "$WORKTREE_ROOT/$env_file"
       fi
     done
   fi
   ```
   Never overwrite a `.env` already present in the worktree — only fill in what's missing, in case the developer deliberately set one up differently there. If the main checkout doesn't have the file either, step 3's `docker compose up` fails with its own clear "env file not found" error — same as running it directly, so no special handling is needed for that case.
2. `docker-compose.yml` fixes both container names (`postgres`, `discord-bot`) rather than letting Compose namespace them per project — a stopped container left over from a previous run (in this checkout or any other clone/worktree of this repo) will collide on the name and make step 3 fail with "Conflict. The container name ... is already in use". Check for and clear that first:
   ```bash
   docker ps -a --filter "name=^postgres$" --filter "name=^discord-bot$" --format '{{.Names}}\t{{.Status}}'
   ```
   For each container listed as `Exited`, tell the developer you're removing it before starting fresh, then remove only those (naming just the `Exited` ones — passing a name that doesn't exist errors on "No such container"):
   ```bash
   docker rm <exited-container-name> [<other-exited-container-name>]
   ```
   (only removes the stopped containers — the named `postgres_data` volume and its data are untouched). If either is listed as anything other than `Exited` (i.e. already running), stop and report that to the developer instead of removing it — it may be a deployment they're actively using.
3. Build and start both services in the background:
   ```bash
   docker compose up -d --build
   ```
4. Poll container status until `postgres` reports healthy and `discord-bot` is `Up` (not `Restarting` or `Exited`):
   ```bash
   docker compose ps
   ```
   Retry every few seconds, up to a reasonable timeout (e.g. 60 seconds). If `discord-bot` is `Restarting` or `Exited`, or `postgres` never reports healthy within the timeout, stop and report the failure along with the relevant `docker compose logs <service>` output.
5. Confirm `discord-bot` connected successfully by checking its logs for the startup notifier's success line, with no fatal error logged first:
   ```bash
   docker compose logs discord-bot
   ```
   Look for a line containing `Posted startup message to channel`. If it's missing after the containers have been up for a few seconds, report what the logs show instead — this usually indicates a missing or invalid Discord token in `apps/discord-bot/.env`.
6. Report to the developer:
   - Which containers are up and their health status.
   - The Postgres connection string for manual inspection: `postgres://blood_bowl:blood_bowl@localhost:5433/blood_bowl` (matches `docker-compose.yml`'s host port mapping).
   - The teardown command: `docker compose down` (add `-v` to also remove the Postgres data volume).
   - That containers are left running for manual inspection — this skill does not tear them down itself.

### Run the BBL import

Run this section only if "Run the BBL import" was selected in step 0 above. Runs after the "Deploy the stack" section if both were selected; runs standalone (no docker steps at all) if only this was selected — e.g. the developer wants to import into an instance already deployed from a previous run.

1. `tools/import-bbl/.env` and its `data/` folder are gitignored, so a git worktree created fresh from a branch won't have them even though the main checkout does. `develop-feature` now normally performs this same sync in its Phase 1 at worktree-creation time, so in a worktree it created this block is a no-op; it is kept here as a fallback for worktrees `develop-feature` did not create (e.g. a manual `git worktree add`, or an existing worktree from a prior session). If running from a worktree, sync both from the main checkout:
   ```bash
   MAIN_ROOT=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
   WORKTREE_ROOT=$(git rev-parse --show-toplevel)
   if [ "$MAIN_ROOT" != "$WORKTREE_ROOT" ]; then
     if [ ! -f "$WORKTREE_ROOT/tools/import-bbl/.env" ] && [ -f "$MAIN_ROOT/tools/import-bbl/.env" ]; then
       cp "$MAIN_ROOT/tools/import-bbl/.env" "$WORKTREE_ROOT/tools/import-bbl/.env"
     fi
     if [ ! -e "$WORKTREE_ROOT/tools/import-bbl/data" ] && [ -d "$MAIN_ROOT/tools/import-bbl/data" ]; then
       ln -s "$MAIN_ROOT/tools/import-bbl/data" "$WORKTREE_ROOT/tools/import-bbl/data"
     fi
   fi
   ```
   Never overwrite a `.env` or `data` entry already present in the worktree — only fill in what's missing, in case the developer deliberately set one up differently there. `data/` holds the actual BBL data download and can be very large, so it is symlinked, never copied — same pattern `develop-feature` uses for `docs/plans`. Because `BBL_DATA_DIR` (see step 2) is typically a relative path resolved against `tools/import-bbl/`'s working directory, the symlinked `data/` directory mirrors the main checkout's structure closely enough that an existing relative value keeps resolving correctly with no rewriting needed.
2. Check `tools/import-bbl/.env` is usable:
   ```bash
   cat tools/import-bbl/.env 2>/dev/null
   ```
   If the file doesn't exist, doesn't set `BBL_DATA_DIR`, still has the `.env.example` placeholder value (`BBL_DATA_DIR=data/<subfolder>`), or its value points to a folder that doesn't exist under `tools/import-bbl/`, ask the developer for the path to their BBL data download (per `docs/import-bbl/index.md`: "Ask the developer for the download if you don't have it"). Then write it into `.env`:
   ```bash
   if [ ! -f tools/import-bbl/.env ]; then
     cp tools/import-bbl/.env.example tools/import-bbl/.env
   fi
   ```
   followed by setting `BBL_DATA_DIR` in that file to the path the developer gave, replacing any existing `BBL_DATA_DIR=` line.
3. Build and run the import — a fresh worktree only ran `pnpm install` (no build) during setup, so `dist/` may not exist yet:
   ```bash
   pnpm --filter @blood-bowl-tracker/import-bbl run build
   pnpm --filter @blood-bowl-tracker/import-bbl run start
   ```
4. Report the outcome to the developer. Per `tools/import-bbl/src/main.ts`, the tool exits `0` and prints a one-line success summary (`Imported <N> coach(es) successfully.`) on stdout; or exits `1`, either printing per-error detail (`Import completed with <N> errors:` followed by each error message) on stderr for errors the import collected, or printing `Import failed:` with the thrown error for an unexpected failure (e.g. the API is unreachable). Report the exit code and the captured output either way. Do not tear down any containers regardless of the import's outcome — same non-goal as the "Deploy the stack" section.

### Generate a SchemaSpy diagram

Run this section only if "Generate a SchemaSpy diagram" was selected in step 0 above. It runs **last** — after both the "Deploy the stack" and "Run the BBL import" sections if those were also selected — so the diagram reflects the schema after any deploy work (it does not interact with the BBL import). It also runs standalone (no docker steps of its own) if only this was selected — e.g. the developer wants a diagram of a stack deployed in a previous session.

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
