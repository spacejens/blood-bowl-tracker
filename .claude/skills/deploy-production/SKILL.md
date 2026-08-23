---
name: deploy-production
description: Use to operate the blood-bowl-tracker production deployment on Fly.io and Neon — check deployment status, restart the machine, roll back to a previous release, trigger a redeploy of current main without a new merge, drop and recreate the production database, run read-only queries against the production database, or run the manual/BBL/TP importers against production
---

# deploy-production

Operates the already-deployed production Discord bot described in `docs/discord-bot/production-hosting.md`: status and log inspection, machine restarts, rollbacks, on-demand redeploys, a destructive database reset, read-only queries against the production database, and the four production import runs. Every action here is a wrapper around commands that page already documents by hand — when an action fails, that page is the fallback.

This skill does **not** perform normal deploys. Those happen automatically in GitHub Actions on every merge to `main` (`.github/workflows/deploy.yml`); the closest thing offered here is dispatching that same workflow against the current `main`.

## Invocation

```
/deploy-production
```

Takes no arguments.

## Preconditions

Preconditions 1 and 3 are true blocking preconditions for every action below — check them once, before step 0's question, and stop with a clear message if one fails. Precondition 2 (`gh` authentication) is needed only by the "Trigger a redeploy without a new merge" action; check it once step 0's selections are known, and only if that action was selected. An unauthenticated `gh` CLI must never block a status check, restart, rollback, database reset, or import run — those don't use `gh` at all, and this matters most during an incident, when the developer may just want `fly status` and shouldn't be stopped by an unrelated tool.

1. `flyctl` is installed and authenticated:
   ```bash
   fly auth whoami
   ```
   If this fails, tell the developer to run `flyctl auth login` themselves — it opens a browser for OAuth and needs a real interactive terminal, so this skill cannot do it for them.
2. `gh` is installed and authenticated — required only for "Trigger a redeploy without a new merge" (see above), checked at the start of that section rather than here:
   ```bash
   gh auth status
   ```
3. Commands run from the repository root of the current checkout or worktree, where `fly.toml` lives. `fly.toml` is committed, so a worktree has it; the gitignored production files each action needs are synced by that action's own steps.

## Steps

0. Ask the developer which action(s) to perform. There are ten actions, and `AskUserQuestion` allows at most 4 options per question, so they are split across **three `multiSelect: true` questions sent in a single `AskUserQuestion` call** — the developer sees all three in sequence and answers once. Ask exactly these three questions, with exactly these options, in this order. Do not add, drop, reword, or reorder any option, and in particular do not add a "Both", "All", "None", or "Neither" option of your own invention — `multiSelect: true` already lets the developer pick any combination, including (by deselecting everything offered) none. See the `AskUserQuestion` option-ceiling and don't-invent-options rules in `CLAUDE.md`'s "Developer prompts" section for the rationale.

   All three questions are one decision split in three, so phrase them that way. The strings below are the `question` text; each also needs a short `header` of its own (`header` is capped at 12 characters, so the question text will not fit there) — e.g. `Run what`, `Run what 2`, `Run what 3`.

   **Question 1 — `question`: "Which action(s) should I run?"** (`multiSelect: true`):
   - **Check deployment status** — run `fly status` and a recent log tail, and summarize the machine's state.
   - **Restart the machine** — start a stopped machine, or restart a running one.
   - **Roll back to a previous release** — pick from Fly's release history and redeploy that image.

   **Question 2 — `question`: "Which action(s) should I run? (continued)"** (`multiSelect: true`):
   - **Trigger a redeploy without a new merge** — dispatch the GitHub Actions deploy workflow against the current `main`.
   - **Drop and recreate the production database** — DESTRUCTIVE: wipe the Neon schema and let the bot's startup migrations rebuild it.
   - **Run the manual import (before other importers) against production** — run `tools/import-manual/` against `data/before-other-importers` over a `flyctl proxy` tunnel.

   **Question 3 — `question`: "Which action(s) should I run? (continued)"** (`multiSelect: true`):
   - **Run the BBL import against production** — run `tools/import-bbl/` over a `flyctl proxy` tunnel.
   - **Run the TP import against production** — run `tools/import-tp/` over a `flyctl proxy` tunnel.
   - **Run the manual import (after other importers) against production** — run `tools/import-manual/` against `data/after-other-importers` over a `flyctl proxy` tunnel.
   - **Run read-only queries against production** — open a read-only `psql` session against the production database to answer a question the developer describes.

   The **union** of the three answers determines which sections below run; the split is purely a presentation constraint and carries no meaning of its own. The developer may select any combination of the ten options, including none. Sections run in the order they appear below, which is the order the options are listed above. No option is gated on any other: each section runs standalone if it is the only one picked. If the union is empty (nothing selected in any of the three questions), report "No action taken" and stop — this is a valid outcome, not an error.

### Check deployment status

Run this section only if "Check deployment status" was selected in step 0 above. Runs first when several actions were selected — it is read-only, and its output is the context every other action is judged against. Runs standalone if it is the only one picked.

1. Get the machine list and state:
   ```bash
   fly status
   ```
   A healthy deployment shows **two** machines, both in state `started` — one active (connected to Discord), one standby. If only one machine is listed, this app hasn't been scaled to the 2-machine setup yet; see the note at the top of `docs/discord-bot/production-hosting.md`'s "Active and standby" section (`fly scale count 2`, a one-time step) rather than treating it as a fault.
2. Read a bounded slice of recent logs from both machines. Do **not** run bare `fly logs` — it streams forever and will hang:
   ```bash
   fly logs --no-tail
   ```
   Output interleaves both machines, each line prefixed with its machine id — use that prefix to tell which machine did what.
3. Summarize for the developer:
   - Each machine's id, state, and role (active or standby — see below), and the release version `fly status` reports.
   - Whether the logs show a healthy startup on each machine: drizzle migrations applying (or nothing pending), then either `Acquired the leader lock; becoming active` → Discord gateway login → `Posted active startup message`, or `Another machine holds the leader lock; standing by` → the standby message. A machine is active if its logs show the former; standby if the latter. Exactly one of the two machines should be active — flag it explicitly if both or neither are (see `docs/discord-bot/production-hosting.md`'s "Common failures" entry "Both machines standby, none active").
   - Any of the failure signatures documented in `docs/discord-bot/production-hosting.md`'s "Checking on the deployment" section, named explicitly when matched:
     - **Crash loop from missing or invalid configuration** — a thrown startup error such as `DATABASE_URL is not configured`, with `fly status` showing repeated restarts. The fix is to correct `apps/discord-bot/.env.production` and re-run `fly secrets import < apps/discord-bot/.env.production` by hand; this skill does not push secrets (see Non-goals).
     - **Stopped after max restarts** — `fly status` shows `stopped` and the logs show "machine has reached its max restart count". Fixing the secret alone does not bring it back; offer the "Restart the machine" action.
     - **Database unreachable** — a connection error during migration. Note that Neon's free tier autosuspends its compute after inactivity, so the first connection after a quiet period is slow by design and is not itself a failure.
     - **`Lost the leader lock while active; exiting`** or **`Failed to complete startup after connecting to Discord; exiting`** — the active machine exited by design after losing the advisory lock or failing a step after connecting. A single occurrence is the intended reaction, and the standby should already have taken over; a repeating loop on the same machine points at the database dropping connections or a persistent Discord-side error worth reading from the surrounding log lines.
4. This section never changes anything. If it finds a problem, report it and let the developer decide — do not restart, redeploy, or reset on your own initiative.

### Restart the machine

Run this section only if "Restart the machine" was selected in step 0 above. Runs after "Check deployment status" if both were selected; runs standalone if it is the only one picked.

A healthy deployment has **two** machines (active + standby, see "Check deployment status"). This section restarts either a single stopped machine or all machines, never a subset chosen arbitrarily — a partial restart of "just the active one" isn't offered here because killing the active machine is exactly the leader-election failover path already exercised automatically (see `docs/discord-bot/production-hosting.md`'s "Active and standby"); use that machine's own crash/restart, not a manual restart of only it, if the intent is to force a handover.

1. Find every machine and its current state, in machine-readable form:
   ```bash
   fly status --json
   ```
   Read each machine's `id` and `state` from the JSON. Zero or one machine listed means this app has not been scaled to two machines yet (see the "Check deployment status" section's note on `fly scale count 2`) — that's a scaling gap, not something this action fixes; report it and stop rather than restarting a partial deployment. More than two machines is unexpected and worth reporting before proceeding.
2. If any machine is in state `stopped` (the max-restart-count case), start each one explicitly:
   ```bash
   fly machine start <machine-id>
   ```
   Otherwise, for a live restart of everything (e.g. to clear a stuck gateway connection on the active machine, or roll both machines through a fresh boot), replace all running machines in place — this restarts both machines, not just one:
   ```bash
   fly apps restart blood-bowl-tracker-discord-bot
   ```
   If any machine is in another state (`starting`, `replacing`, …), report the state and stop for that machine — mid-transition machines should be allowed to settle rather than have a second operation stacked on them; suggest re-running "Check deployment status" in a moment.
3. Wait for both machines to come back, polling rather than sleeping blindly:
   ```bash
   fly status
   ```
   Retry every few seconds up to about 60 seconds, until both machines report `started`.
4. Confirm the restart actually produced a healthy boot on both machines:
   ```bash
   fly logs --no-tail
   ```
   Look for the same healthy-startup markers as the "Check deployment status" section on each machine (migrations, then either the active or standby leader-election outcome). A machine restarting both at once means both race for the advisory lock fresh — expect exactly one to win and log `Acquired the leader lock; becoming active`, the other to log `Another machine holds the leader lock; standing by`; which one wins is not deterministic and does not need to match which one was active before. A machine in state `started` whose logs show a thrown startup error is a crash loop, not a successful restart — report it that way. A one-off migration error on one of the two machines immediately after a simultaneous restart is the documented migration-race failure mode (see `docs/discord-bot/production-hosting.md`'s "Common failures") and self-heals on Fly's automatic retry; a repeating loop does not.
5. Report the outcome: which command was run, each machine's final state and role (active/standby), and what the logs showed. A restart does not change the deployed image; if the underlying problem is the code or config that was deployed, say so and point at the rollback and redeploy actions.

### Roll back to a previous release

Run this section only if "Roll back to a previous release" was selected in step 0 above. Runs after the "Check deployment status" and "Restart the machine" sections if those were also selected; runs standalone if it is the only one picked.

1. List the release history with image references:
   ```bash
   fly releases --json
   ```
   Each entry carries a version, a status, a creation timestamp, and the image reference that release deployed (the `ImageRef` field). If the JSON shape is not what you expect, fall back to the human-readable `fly releases` table and say so in your report rather than guessing at a field name.
2. If there is only one release, or none, stop and report that there is nothing to roll back to. This is the state right after a first deploy, and it is not an error.
3. Otherwise ask the developer which release to roll back to, using `AskUserQuestion` with the **four most recent releases other than the currently deployed one** as options (`AskUserQuestion` allows at most 4 options; if fewer than four exist, offer what exists — but note the tool needs at least 2 options, so with exactly one candidate use a plain conversational confirmation instead of the tool). Label each option with its version and creation timestamp, and put the image reference and status in the option's description so the developer can see what they are choosing. Do not preselect or recommend one — only the developer knows which release was good.
4. Warn before running anything, in the same message as the confirmation: a rollback deploys from this machine and therefore sits outside the GitHub Actions deploy path, so **the next merge to `main` redeploys the newest code over it**. A rollback buys time; the offending change still has to be reverted or fixed on `main`.
5. Deploy the chosen image from the repository root:
   ```bash
   fly deploy --image <image-ref-from-the-chosen-release>
   ```
   This skips the build entirely — the image already exists in Fly's registry.
6. Verify the rollback landed:
   ```bash
   fly status
   fly logs --no-tail
   ```
   Expect both machines in state `started` and a healthy startup on each (see "Check deployment status" for what that looks like across two machines). `fly releases` now shows a _new_ release whose image is the old one — Fly records the rollback as a new release rather than reverting to the old release number.
7. Report to the developer: which release was rolled back to, its image reference, the new release version Fly created, and a reminder that `main` still carries the bad code.

### Trigger a redeploy without a new merge

Run this section only if "Trigger a redeploy without a new merge" was selected in step 0 above. Runs after the "Check deployment status", "Restart the machine", and "Roll back to a previous release" sections if those were also selected; runs standalone if it is the only one picked.

This dispatches the same `.github/workflows/deploy.yml` workflow that merges to `main` trigger, so it deploys whatever `main` currently points at — useful after pushing changed Fly secrets, after a rollback that needs undoing, or to retry a deploy that failed transiently. It is not a way to deploy a branch: the workflow always builds the ref it is dispatched against, and this skill always dispatches `main`.

0. Check that `gh` is installed and authenticated — this is the one action in this skill that needs it (see the Preconditions section):
   ```bash
   gh auth status
   ```
   If this fails, tell the developer to run `gh auth login` themselves and stop; do not attempt any of the steps below without it.
1. Note the current release version first, so the new one is distinguishable:
   ```bash
   fly status
   ```
2. Dispatch the workflow:
   ```bash
   gh workflow run deploy.yml --ref main
   ```
   If this fails with a "workflow does not exist" style error, the workflow file has not reached `main` yet (it only becomes dispatchable once merged) — report that rather than retrying.
3. Find the run that was just created. `gh workflow run` prints no run id, and the run takes a moment to appear, so poll:
   ```bash
   gh run list --workflow=deploy.yml --limit 1 --json databaseId,status,createdAt,url
   ```
   Retry every few seconds for up to about 30 seconds until a run appears whose `createdAt` is after step 2. If none appears, report that the dispatch did not produce a run and stop.
4. Follow it to completion:
   ```bash
   gh run watch <databaseId-from-step-3> --exit-status
   ```
   This exits non-zero if the run fails. On failure, fetch the failing step's log and report it:
   ```bash
   gh run view <databaseId-from-step-3> --log-failed
   ```
   The most common failure is an expired or missing `FLY_API_TOKEN` secret, which surfaces as an authentication error from `flyctl`. Fixing it is a manual step (see `docs/discord-bot/production-hosting.md`'s "First-time setup") — this skill does not mint or store tokens.
5. On success, verify the deployment the same way the rollback section does:
   ```bash
   fly status
   fly logs --no-tail
   ```
6. Report to the developer: the run URL, its conclusion, the release version before and after, and what the logs showed.

### Drop and recreate the production database

Run this section only if "Drop and recreate the production database" was selected in step 0 above. Runs after every earlier section if those were also selected; runs standalone if it is the only one picked.

**This is destructive and has no undo.** It deletes all production data. The only way back is a full re-import, which is much slower against production than locally and leaves the bot serving empty data for that whole window. Treat every step below as mandatory — in particular, never skip step 4's typed confirmation, and never proceed on an implied or assumed "yes".

1. Make sure the production environment file is present. `apps/discord-bot/.env.production` is gitignored, so a worktree created fresh from a branch will not have it even though the main checkout does. Fill it in from the main checkout only if missing — never overwrite a copy already in the worktree, and never create one from a template:
   ```bash
   MAIN_ROOT=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
   WORKTREE_ROOT=$(git rev-parse --show-toplevel)
   if [ "$MAIN_ROOT" != "$WORKTREE_ROOT" ] && [ ! -f "$WORKTREE_ROOT/apps/discord-bot/.env.production" ] && [ -f "$MAIN_ROOT/apps/discord-bot/.env.production" ]; then
     cp "$MAIN_ROOT/apps/discord-bot/.env.production" "$WORKTREE_ROOT/apps/discord-bot/.env.production"
   fi
   ```
   If the file exists in neither place, stop and tell the developer to create it per `docs/discord-bot/production-hosting.md`'s "Configuration and secrets" section. Do not try to read `DATABASE_URL` out of Fly instead.
2. Confirm the file actually sets `DATABASE_URL`, **without printing its value** — it is the production database credential and must never appear in the transcript:
   ```bash
   grep -c '^DATABASE_URL=' apps/discord-bot/.env.production
   ```
   Expected output: `1`. Anything else (0, or more than one) — stop and report. Every later step reads this value into a shell variable and never echoes it.
3. Capture a baseline row count for every table, **before** anything is dropped. There are no backups (see Non-goals), so these counts are the only way to sanity-check afterwards that the re-import reproduced comparable data. Run this the same way as step 5's drop — a single shell invocation, the same extraction and validation of `DATABASE_URL`, never echoed — and in a read-only transaction, since nothing here should write:
   ```bash
   DATABASE_URL=$(grep -m1 '^DATABASE_URL=' apps/discord-bot/.env.production | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e 's/\r$//')
   case "$DATABASE_URL" in
     postgres://*|postgresql://*) ;;
     *) echo "DATABASE_URL is empty or malformed after extraction — aborting without connecting." >&2; exit 1 ;;
   esac
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At \
     -c 'SET default_transaction_read_only = on;' \
     -c "SELECT relname, n_live_tup FROM pg_stat_user_tables WHERE schemaname = 'game_data' AND relname NOT LIKE '%\_history' ORDER BY relname;"
   ```
   `n_live_tup` is an estimate maintained by the statistics collector, which is what makes this affordable on every table at once; it is a baseline to compare against, not an exact audit. History tables are excluded because their counts grow with every re-import by design and would not be comparable. If the developer needs exact counts for specific tables, run those as explicit `SELECT count(*)` queries.

   Report the full table of counts to the developer **in the conversation** before continuing, and keep it — step 9's report and any later comparison depend on it, and it is gone the moment the schema is dropped. If this step fails to connect, stop: dropping a database whose prior contents were never recorded gives up the only check that the re-import worked.

4. Require a typed confirmation. Ask the developer, in plain text, to reply with exactly:

   ```
   blood-bowl-tracker-discord-bot
   ```

   Say plainly in the same message what will be destroyed (all production data in the Neon database), that there are no backups, and that recovery means a full re-import. Use a plain conversational prompt here rather than `AskUserQuestion` — a button is too easy to click through by habit, which is the entire point of a typed phrase, and `CLAUDE.md` explicitly allows a plain prompt when there is only one path forward. Compare the developer's reply to the phrase exactly, character for character. Anything else — a paraphrase, a "yes", the app name with different capitalisation or stray punctuation — is a refusal: abandon this section, report that nothing was changed, and continue with any other selected sections **except** the four "against production" import actions — if any of those were also selected in step 0, do not run them automatically. Report that they were skipped because the reset they were expected to follow did not happen, and that the developer can re-invoke the skill to run them deliberately against the existing, unmodified production data if that is actually what they want.

5. Drop and recreate the schemas. Run this as a **single** shell invocation so `DATABASE_URL` stays in scope — shell state does not persist between separate command calls — and never echo the variable. Validate the extracted value before connecting: `cut -d= -f2-` does not strip a dotenv-style surrounding quote pair or a trailing CRLF, and `psql` given an empty or malformed connection string does not error — it silently falls back to libpq's local-connection defaults, which could drop schemas in a local database while this step reports success against production, so abort rather than let that happen:

   ```bash
   DATABASE_URL=$(grep -m1 '^DATABASE_URL=' apps/discord-bot/.env.production | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e 's/\r$//')
   case "$DATABASE_URL" in
     postgres://*|postgresql://*) ;;
     *) echo "DATABASE_URL is empty or malformed after extraction — aborting without connecting." >&2; exit 1 ;;
   esac
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
     -c 'DROP SCHEMA IF EXISTS public CASCADE;' \
     -c 'CREATE SCHEMA public;' \
     -c 'DROP SCHEMA IF EXISTS drizzle CASCADE;'
   ```

   If the `case` aborts, stop and report that `DATABASE_URL` looked empty or malformed after extraction — without ever printing the value itself — and tell the developer to check `apps/discord-bot/.env.production` by hand. Both schemas must go. The application tables live in `public`, but drizzle-orm records which migrations have already run in `drizzle.__drizzle_migrations` (see `packages/db/src/db.ts`). Dropping `public` alone would leave that journal asserting every migration was applied, so the restart in step 6 would rebuild nothing and leave an empty database the bot starts against perfectly happily — a silent failure. This mirrors `docker compose down -v` locally, which wipes the whole volume.

   If `psql` is not installed, stop and report — this action cannot proceed without it. If it fails to connect, report the error; Neon autosuspends idle compute, so a first connection can be slow, and retrying once is reasonable before giving up.

6. Restart both machines so the bot's startup migrations rebuild the schema:
   ```bash
   fly apps restart blood-bowl-tracker-discord-bot
   ```
   `packages/db`'s `createDb` runs drizzle's `migrate()` before the app serves anything, exactly as it does on a first deploy against an empty database. No separate migration command exists or is needed. This restarts both machines at the same moment, which is the one scenario where the two machines can race to apply the same migration against the now-empty database (see `docs/discord-bot/production-hosting.md`'s "Common failures" entry on the migration race) — expect this and don't treat one machine briefly crash-looping on a migration error as a failed reset; step 7 covers what to actually check.
7. Verify the rebuild on both machines, polling until both report `started` (up to about 60 seconds):
   ```bash
   fly status
   fly logs --no-tail
   ```
   A successful reset shows every migration applying in order (not "nothing pending") on at least one machine, then a normal startup with the usual active/standby leader-election outcome across the two. If the other machine's logs show a migration error immediately after the restart, that's the documented race — it should recover on Fly's automatic retry once the winning machine's migration has committed; give it another `fly status`/`fly logs --no-tail` pass before treating it as a real failure. **"Nothing pending" on every machine against a freshly dropped database means the `drizzle` schema survived** — report that specifically rather than as a generic success, and do not chain into the imports. This also means any of the four "against production" import actions that were selected back in step 0 must **not** run automatically either — the reset they were expected to follow did not actually happen. Report the failure, report that those imports were skipped as a result, and stop before reaching any import section; do not proceed to step 8 below.
8. On success, offer to chain straight into the production imports — otherwise production sits empty until someone remembers to re-import. Skip any import action already selected in step 0 (it will run on its own below), and skip this question entirely if all four were already selected. Ask with `AskUserQuestion`, `multiSelect: true`, `question`: "The database is empty. Which imports should I run now?", offering the not-already-selected subset of exactly these four options, in this order:
   - **Run the manual import (before other importers) against production**
   - **Run the BBL import against production**
   - **Run the TP import against production**
   - **Run the manual import (after other importers) against production**

   Add nothing else to that list — no "All", no "None"; deselecting everything already means "none", and that is a valid answer meaning production stays empty for now. Anything selected here joins the set from step 0 and runs in the same fixed order as the sections below.

9. Report to the developer: that the schemas were dropped and recreated, what the restart's migration output showed, and which imports (if any) are about to run or were declined.

### Production imports: shared setup

Run this section only if at least one of the four "against production" import actions was selected in step 0 (or chained from the database reset above). It is not a menu option of its own — it is the setup those actions share, run once no matter how many of them were selected, immediately before the first of them.

Throughout this section and the four import sections below, "or chained from the database reset" means the reset actually ran and completed successfully (its step 7 confirmed the schemas rebuilt, not "nothing pending"). If the reset was refused at its typed confirmation, or completed but step 7 detected "nothing pending", any import action selected alongside it does **not** run automatically — see the reset section's step 4 and step 7 for the exact handling.

Everything here automates the flow documented in `docs/discord-bot/production-hosting.md`'s "Running import tools against production" section; read that section when something here fails.

1. Sync the gitignored production config files and data directories that a fresh worktree lacks. Copy configs only when missing, symlink the (potentially very large) data directories rather than copying them, and never overwrite anything already present:
   ```bash
   MAIN_ROOT=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
   WORKTREE_ROOT=$(git rev-parse --show-toplevel)
   if [ "$MAIN_ROOT" != "$WORKTREE_ROOT" ]; then
     for cfg in tools/import-manual/import-manual-config.production.json5 \
                tools/import-bbl/import-bbl-config.production.json5 \
                tools/import-tp/import-tp-config.production.json5; do
       if [ ! -f "$WORKTREE_ROOT/$cfg" ] && [ -f "$MAIN_ROOT/$cfg" ]; then
         cp "$MAIN_ROOT/$cfg" "$WORKTREE_ROOT/$cfg"
       fi
     done
     for data in tools/import-bbl/data tools/import-tp/data; do
       if [ ! -e "$WORKTREE_ROOT/$data" ] && [ -d "$MAIN_ROOT/$data" ]; then
         ln -s "$MAIN_ROOT/$data" "$WORKTREE_ROOT/$data"
       fi
     done
   fi
   ```
   (`tools/import-manual/data` is committed to git, so it needs no sync.)
2. Build `tools/ai-helpers` if `dist/main.js` is missing — a fresh worktree only ran `pnpm install`, and steps 3, 6, and the teardown section below all invoke it:
   ```bash
   pnpm --filter @blood-bowl-tracker/ai-helpers run build
   ```
3. Check that the production config each selected import needs exists:
   ```bash
   ls tools/import-manual/import-manual-config.production.json5 \
      tools/import-bbl/import-bbl-config.production.json5 \
      tools/import-tp/import-tp-config.production.json5 2>&1
   ```
   If the file a selected import needs is missing, stop that import and tell the developer to create it once, from the same `import-*-config.example.json5` template as the local config, filling in the production `apiToken` from the matching `API_TOKEN_IMPORT_*` value in `apps/discord-bot/.env.production` — see `docs/discord-bot/production-hosting.md`. **Do not create it from the template yourself**: a config copied from the example would carry a placeholder token and fail with `401`, and authoring production credentials is a developer's job, not this skill's (see Non-goals). A missing file for one tool does not block the other tools' imports.
4. For each selected import whose production config exists (from step 3), check that its `apiBaseUrl` is exactly the tunnel's local port rather than a stale pre-migration value. This parses each config with JSON5 and compares `connection.apiBaseUrl` exactly, so a `localhost:30010` value or a `localhost:3001` mention elsewhere in the file (e.g. a comment) cannot pass it — the check lives in `tools/ai-helpers` (see `check-production-config-port.service.ts`), not inline here, so it stays unit tested:
   ```bash
   node tools/ai-helpers/dist/main.js check-production-config-port http://localhost:3001
   ```
   It prints `{"stale": [...]}` — an empty array means every existing production config already points at the right port. An entry here only matters for a *selected* import; a stale config for an import the developer didn't choose to run is not this run's problem. Most entries name a config whose `apiBaseUrl` doesn't match exactly (it very likely still has `localhost:3000` from before the tunnel's local port moved); an entry can also carry a `parseError` instead, when the file isn't valid JSON5 at all — either way, stop that import and tell the developer: for a mismatched `apiBaseUrl`, that it needs manual updating to `http://localhost:3001` (see the migration note in `docs/discord-bot/production-hosting.md`); for a `parseError`, the parse error itself, since the file needs fixing by hand before it can be checked at all. **Do not edit the file yourself** — same stance as the missing-file case in step 3 (see Non-goals). A stale config for one tool does not block the other tools' imports, and one unparseable config does not stop the others from being checked.
5. Make sure nothing else is already bound to port 3001 — the port this tunnel uses. `deploy-local`'s docker-compose stack binds `3000`, not `3001`, so it is deliberately not a source of collision here; what this check guards against is another production tunnel already running (typically a concurrent `deploy-production` run in a different worktree), which would make the `flyctl proxy` below fail to bind:
   ```bash
   lsof -nP -iTCP:3001 -sTCP:LISTEN
   ```
   If anything is listening, stop and report what holds the port (typically a leftover `flyctl proxy 3001:3000` from an earlier or concurrent `deploy-production` run — see "Production imports: closing the tunnel"). Do not kill the process yourself.
6. Build the import tools that will run. A fresh worktree only ran `pnpm install`, so `dist/` may not exist yet — build just what is needed:
   ```bash
   pnpm --filter @blood-bowl-tracker/import-manual run build   # if either manual import was selected
   pnpm --filter @blood-bowl-tracker/import-bbl run build      # if the BBL import was selected
   pnpm --filter @blood-bowl-tracker/import-tp run build       # if the TP import was selected
   ```
7. Open the private tunnel to the production machine. This spawns `flyctl proxy 3001:3000` detached (so it keeps running after this command returns) and persists its pid to a worktree-scoped, gitignored file, so the teardown section can target this run's own tunnel specifically rather than matching any process by command line — the logic lives in `tools/ai-helpers` (see `production-tunnel.service.ts`), not as an inline shell script here, both because spawning a detached process and persisting its pid across separate tool invocations needs real process control a shell one-liner can't give it, and so it stays unit tested:
   ```bash
   node tools/ai-helpers/dist/main.js start-production-tunnel 3001 3000
   ```
   It prints `{"pid": <n>}`. `3001` is the local port this tunnel listens on; `3000` is the production machine's own listening port (see `fly.toml`), which is unrelated to this change and stays `3000`. Because step 5's pre-flight check already refused to proceed if port 3001 was already bound, no other `flyctl proxy 3001:3000` can have bound it between then and this command running — the pid captured here is this run's own tunnel, unambiguously, even if that tunnel later dies and a different one starts on the now-free port before teardown runs.
8. Wait for the tunnel to accept connections before running any importer, polling for up to about 30 seconds:
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' --max-time 5 http://localhost:3001/rpc
   ```
   Any HTTP status at all (including `404` or `405`) means the tunnel is up — the RPC server answered. `curl` exiting with a connection error means it is not up yet. If it never comes up, report the tunnel command's own output, kill it (see "Production imports: closing the tunnel" below), and stop — running an importer against a dead tunnel just produces `ECONNREFUSED` for every record.

### Run the manual import (before other importers) against production

Run this section only if "Run the manual import (before other importers) against production" was selected in step 0 (or chained from the database reset). It runs after "Production imports: shared setup", which must have completed successfully. Runs standalone (no other import) if it is the only import picked — the shared setup and teardown still run around it.

1. Run the importer against the "before" data directory, with the production config selected by the environment variable:
   ```bash
   ( cd tools/import-manual && IMPORT_CONFIG_ENV=production node dist/main.js data/before-other-importers )
   ```
   `IMPORT_CONFIG_ENV` must be set on the same command as the tool — setting it in an earlier, separate shell call has no effect, and the tool would then silently use the local config and write to whatever `apiBaseUrl` that names.
2. Report the outcome. Per `tools/import-manual/src/main.ts` the tool exits `0` printing `Imported <N> record(s) successfully.` on stdout; or exits `1`, either printing `Import completed with <N> errors:` followed by each error message on stderr, or `Import failed:` with the thrown error for an unexpected failure. Report the exit code and the captured output either way.
3. Interpret common failures against production specifically, per `docs/discord-bot/production-hosting.md`: `ECONNREFUSED` on `localhost:3001` means the tunnel died mid-run; `401` means the `apiToken` in the `.production.json5` file does not match the corresponding `API_TOKEN_IMPORT_*` secret pushed to Fly.
4. These are real writes to the production database with no rollback, so a failure partway through leaves earlier records in place. Do not attempt to undo them. If the developer wants a clean slate, that is the "Drop and recreate the production database" action, chosen deliberately.
5. A failure here does **not** skip the remaining selected imports — report it and continue to the next section, then close the tunnel as usual.

### Run the BBL import against production

Run this section only if "Run the BBL import against production" was selected in step 0 (or chained from the database reset). Runs after "Production imports: shared setup" and after the manual "before" import if that was also selected; runs standalone if it is the only import picked.

1. Run the importer:
   ```bash
   ( cd tools/import-bbl && IMPORT_CONFIG_ENV=production node dist/main.js )
   ```
2. Report the outcome. Per `tools/import-bbl/src/main.ts` the tool exits `0` printing `Imported <N> coach(es) successfully.` on stdout; or exits `1`, either printing `Import completed with <N> errors:` followed by each error message on stderr, or `Import failed:` with the thrown error. Report the exit code and the captured output.
3. This import is by far the longest of the four against production — each record is a separate call over the tunnel, so a full run takes considerably longer than it does locally. Do not treat a long-running import as a hang; only a stalled tunnel (repeated `ECONNREFUSED`) is a failure.
4. The same production failure interpretations, no-rollback caveat, and continue-on-failure behaviour as the manual "before" section apply here.

### Run the TP import against production

Run this section only if "Run the TP import against production" was selected in step 0 (or chained from the database reset). Runs after "Production imports: shared setup", the manual "before" import, and the BBL import if those were also selected; runs standalone if it is the only import picked.

1. Run the importer:
   ```bash
   ( cd tools/import-tp && IMPORT_CONFIG_ENV=production node dist/main.js )
   ```
2. Report the outcome. Per `tools/import-tp/src/main.ts` the tool exits `0` printing `Imported <N> record(s) successfully.` on stdout; or exits `1`, either printing `Import completed with <N> errors:` followed by each error message on stderr, or `Import failed:` with the thrown error. Report the exit code and the captured output.
3. The same production failure interpretations, no-rollback caveat, and continue-on-failure behaviour as the manual "before" section apply here.

### Run the manual import (after other importers) against production

Run this section only if "Run the manual import (after other importers) against production" was selected in step 0 (or chained from the database reset). Runs last of the four imports, after every other selected import — its whole purpose is to clean up names and attach external IDs once the system-specific importers have run. Runs standalone if it is the only import picked.

1. Run the importer against the "after" data directory:
   ```bash
   ( cd tools/import-manual && IMPORT_CONFIG_ENV=production node dist/main.js data/after-other-importers )
   ```
2. Report the outcome using the same success/error/`Import failed:` formats as the manual "before" section, plus the same production failure interpretations and no-rollback caveat.

### Production imports: closing the tunnel

Run this section only if "Production imports: shared setup" ran. Like that section it is not a menu option — it is the teardown the import actions share, run once after the last selected import finishes, **regardless of whether the imports succeeded or failed**, and also on any early stop inside an import section.

1. Stop this run's own tunnel, using the pid persisted by `start-production-tunnel` rather than a broad process-name match — a `pkill` by command line alone cannot tell this run's tunnel apart from a different one that started after this run's own tunnel exited (e.g. a crash mid-import, followed by another developer's `deploy-production` run reusing the now-free port before this teardown fires):
   ```bash
   node tools/ai-helpers/dist/main.js stop-production-tunnel
   ```
   It prints `{"stopped": true}` if it signaled a live process, or `{"stopped": false}` if there was no persisted tunnel or it had already exited on its own — either is a normal outcome, not a failure. Do not fall back to `pkill -f 'flyctl proxy 3001:3000'` — that broad pattern is exactly what risks stopping a different, unrelated tunnel.
2. Confirm the port is free again:
   ```bash
   lsof -nP -iTCP:3001 -sTCP:LISTEN
   ```
   Expected: no output. If something is still listening, tell the developer explicitly — a leftover tunnel will collide with the next `deploy-production` run's own tunnel. It will not collide with `deploy-local`, which binds `3000`.
3. Report a combined summary of every import that ran: which ones, their exit codes, record counts, and any errors. Say explicitly that the tunnel is closed, so the developer knows no private connection to production was left open.

### Run read-only queries against production

Run this section only if "Run read-only queries against production" was selected in step 0 above. Runs last — after the "Drop and recreate the production database" section and after every selected import section (and their tunnel teardown) if those were also selected: a reset's baseline counts are captured by that section's own step 3, and this section is how the *post*-reimport comparison gets made once any selected imports have actually populated the database. Runs standalone if it is the only one picked.

This action answers a question the developer asks about live production data. There is deliberately **no fixed or pre-approved query list**: the useful queries change with whatever is being investigated, and a hardcoded list would only ever match the investigation that prompted writing it. The developer describes what they want to know; you write the SQL for it in the conversation, show it to them before running it, and run it inside a session the database itself holds read-only.

1. Make sure the production environment file is present, exactly as the reset section's step 1 does — copy it from the main checkout only if missing, never overwrite a copy already in the worktree, and never create one from a template:
   ```bash
   MAIN_ROOT=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
   WORKTREE_ROOT=$(git rev-parse --show-toplevel)
   if [ "$MAIN_ROOT" != "$WORKTREE_ROOT" ] && [ ! -f "$WORKTREE_ROOT/apps/discord-bot/.env.production" ] && [ -f "$MAIN_ROOT/apps/discord-bot/.env.production" ]; then
     cp "$MAIN_ROOT/apps/discord-bot/.env.production" "$WORKTREE_ROOT/apps/discord-bot/.env.production"
   fi
   ```
   If the file exists in neither place, stop and tell the developer to create it per `docs/discord-bot/production-hosting.md`'s "Configuration and secrets" section.
2. Confirm the file sets `DATABASE_URL`, **without printing its value**:
   ```bash
   grep -c '^DATABASE_URL=' apps/discord-bot/.env.production
   ```
   Expected output: `1`. Anything else — stop and report.
3. Ask the developer what they want to know, unless they already said. Use a plain conversational prompt rather than `AskUserQuestion` — the answer is free-form text, not a choice among options. Then write the SQL and show it to them before running it, with a one-line explanation of what each statement returns. Application tables live in the `game_data` schema (see `packages/db/src/schema/pg-schema.ts`), so qualify names as `game_data.<table>`.
4. Run the query. Do this as a **single** shell invocation so `DATABASE_URL` stays in scope — shell state does not persist between separate command calls — and never echo the variable. Validate the extracted value before connecting, for the same reason the reset section does: `cut -d= -f2-` does not strip a dotenv-style surrounding quote pair or a trailing CRLF, and `psql` given an empty or malformed connection string silently falls back to libpq's local-connection defaults, which would run the query against a local database while reporting it as production.

   The generated query is arbitrary SQL the developer described, and it may itself contain single-quoted string literals (e.g. `WHERE status = 'active'`). Wrapping the whole query in single quotes for `-c` breaks the moment the query contains one: the shell treats that embedded `'` as the end of the argument, corrupting the command. Assign the query text to a shell variable via a single-quoted heredoc instead — heredoc content is not shell-quoted, so any single quotes inside the query pass through intact — and pass the variable to `-c` with double-quote expansion. Use a delimiter distinctive enough that the query text won't plausibly contain it as a standalone line (`SQL_QUERY_EOF_<random 6-digit number>`, not a plain word like `SQL`), and double-check the query text for that exact line before running:

   ```bash
   DATABASE_URL=$(grep -m1 '^DATABASE_URL=' apps/discord-bot/.env.production | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e 's/\r$//')
   case "$DATABASE_URL" in
     postgres://*|postgresql://*) ;;
     *) echo "DATABASE_URL is empty or malformed after extraction — aborting without connecting." >&2; exit 1 ;;
   esac
   QUERY=$(cat <<'SQL_QUERY_EOF_482917'
   <the actual query text, written literally here, single quotes and all>
   SQL_QUERY_EOF_482917
   )
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
     -c 'BEGIN TRANSACTION READ ONLY;' \
     -c "SET LOCAL statement_timeout = '30s';" \
     -c "$QUERY" \
     -c 'COMMIT;'
   ```

   This is different from the fixed `-c '...'` queries used elsewhere in this file (e.g. the reset section's `SET` statements and its `DROP SCHEMA`/`CREATE SCHEMA` statements): those are hardcoded strings this skill itself wrote, so their quoting is settled at authoring time, and none of them contain an embedded single quote. (The reset section's baseline row-count query is the one exception worth noting: it's also hardcoded, but its `WHERE` clause needs a literal `'game_data'`, so it's already `-c "..."` double-quoted for that reason.) This section's query is arbitrary and developer-described, so it needs the heredoc form instead.

   All four `-c` flags run against the same session, so the explicit `BEGIN`/`COMMIT` bracket the read-only setting and the query in one transaction — this matters, not just tidiness: `SET default_transaction_read_only = on` (used elsewhere in this section's earlier drafts) only sets a *session default* for future transactions, and an ordinary role can still issue `SET default_transaction_read_only = off` mid-session to undo it before its own next statement. `BEGIN TRANSACTION READ ONLY`, by contrast, marks the *current* transaction read-only, and Postgres refuses `SET TRANSACTION READ WRITE` inside an already-read-only transaction — so nothing the query's own text does can flip it back before `COMMIT`. `SET LOCAL` (rather than plain `SET`) scopes the statement timeout to this one transaction for the same reason, rather than leaning on a session-wide setting the query could also reset.

   `BEGIN TRANSACTION READ ONLY` is a database-enforced backstop, not a substitute for reading the query first. Postgres hard-errors on any write it reaches, including the non-obvious ones a visual review can miss: `SELECT ... FOR UPDATE`, `SELECT setval(...)`/`nextval(...)`, `SELECT ... INTO`, and any `INSERT`/`UPDATE`/`DELETE`/DDL. If a query is rejected with `cannot execute ... in a read-only transaction`, that is the guard working — report it and do **not** disable the setting to get the query through. A genuine write against production only ever happens through the importers or the reset action, chosen deliberately. This is a defense against an accidentally wrong query, not a hardened defense against deliberately adversarial SQL text designed to smuggle in its own `COMMIT`/`BEGIN` pair to end-run the wrapping — closing that fully would need a dedicated, privilege-restricted read-only database role, which is out of scope here (see Non-goals).

   `statement_timeout = '30s'` bounds the damage an accidentally expensive query can do to the live bot's database. If a query times out, say so and offer a narrowed version (a tighter `WHERE`, a `LIMIT`, an aggregate instead of a row dump) rather than raising the timeout.

   If `psql` is not installed, stop and report — this action cannot proceed without it. If it fails to connect, report the error; Neon autosuspends idle compute, so a first connection after a quiet period is slow by design, and retrying once is reasonable before giving up.
5. Report the query that was run and its output. Keep the output as-is rather than summarising away rows the developer asked to see; if it is very large, say how many rows came back and show a representative slice. Never print the connection string, and do not paste query output that would contain a credential.
6. If the developer has follow-up questions, repeat from step 3. Each one is a fresh `psql` invocation with its own `SET`s — never keep a session open across tool calls, because shell state does not persist between them.

## Non-goals

- **No normal deploys.** Merging to `main` deploys; this skill never runs `flyctl deploy` except as the mechanism of the rollback action, which deliberately deploys an _older_ image.
- **No credential management.** The skill never runs `fly tokens create`, `gh secret set`, or `fly secrets import`. Creating the `FLY_API_TOKEN` secret and pushing `.env.production` to Fly stay manual, documented steps in `docs/discord-bot/production-hosting.md`.
- **No creating of gitignored production config.** `apps/discord-bot/.env.production` and the `tools/import-*/import-*-config.production.json5` files are authored once by a developer. This skill syncs them into a worktree and checks them, but never generates one from a template — same stance `deploy-local` takes on the local equivalents.
- **No backups.** There is no backup or restore of the Neon database; production data is reproducible by re-import, as `docs/discord-bot/production-hosting.md` documents.
- **No teardown.** The skill never stops or destroys the Fly machine or the Neon project.
- **No dedicated read-only database role.** The read-only-queries action enforces its guard with an explicit `BEGIN TRANSACTION READ ONLY` and `SET LOCAL statement_timeout`, not a separate, privilege-restricted Postgres role — it connects with the same `DATABASE_URL` role every other action here uses. That closes accidental writes but not deliberately adversarial SQL crafted to smuggle in its own `COMMIT`/`BEGIN` pair. Provisioning and distributing credentials for a dedicated role is a real credential-management task, which this skill deliberately stays out of (see above).
