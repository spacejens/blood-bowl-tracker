---
name: deploy-production
description: Use to operate the blood-bowl-tracker production deployment on Fly.io and Neon — check deployment status, restart the machine, roll back to a previous release, trigger a redeploy of current main without a new merge, drop and recreate the production database, or run the manual/BBL/TP importers against production
---

# deploy-production

Operates the already-deployed production Discord bot described in `docs/discord-bot/production-hosting.md`: status and log inspection, machine restarts, rollbacks, on-demand redeploys, a destructive database reset, and the four production import runs. Every action here is a wrapper around commands that page already documents by hand — when an action fails, that page is the fallback.

This skill does **not** perform normal deploys. Those happen automatically in GitHub Actions on every merge to `main` (`.github/workflows/deploy.yml`); the closest thing offered here is dispatching that same workflow against the current `main`.

## Invocation

```
/deploy-production
```

Takes no arguments.

## Preconditions

These apply to every action below. Check them once, before step 0's question, and stop with a clear message if one fails — every action here is useless without them.

1. `flyctl` is installed and authenticated:
   ```bash
   fly auth whoami
   ```
   If this fails, tell the developer to run `flyctl auth login` themselves — it opens a browser for OAuth and needs a real interactive terminal, so this skill cannot do it for them.
2. `gh` is installed and authenticated (needed by the redeploy action, and harmless otherwise):
   ```bash
   gh auth status
   ```
3. Commands run from the repository root of the current checkout or worktree, where `fly.toml` lives. `fly.toml` is committed, so a worktree has it; the gitignored production files each action needs are synced by that action's own steps.

## Steps

0. Ask the developer which action(s) to perform. There are nine actions, and `AskUserQuestion` allows at most 4 options per question, so they are split across **three `multiSelect: true` questions sent in a single `AskUserQuestion` call** — the developer sees all three in sequence and answers once. Ask exactly these three questions, with exactly these options, in this order. Do not add, drop, reword, or reorder any option, and in particular do not add a "Both", "All", "None", or "Neither" option of your own invention — `multiSelect: true` already lets the developer pick any combination, including (by deselecting everything offered) none. See the `AskUserQuestion` option-ceiling and don't-invent-options rules in `CLAUDE.md`'s "Developer prompts" section for the rationale.

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

   The **union** of the three answers determines which sections below run; the split is purely a presentation constraint and carries no meaning of its own. The developer may select any combination of the nine options, including none. Sections run in the order they appear below, which is the order the options are listed above. No option is gated on any other: each section runs standalone if it is the only one picked. If the union is empty (nothing selected in any of the three questions), report "No action taken" and stop — this is a valid outcome, not an error.

### Check deployment status

Run this section only if "Check deployment status" was selected in step 0 above. Runs first when several actions were selected — it is read-only, and its output is the context every other action is judged against. Runs standalone if it is the only one picked.

1. Get the machine list and state:
   ```bash
   fly status
   ```
   A healthy deployment shows exactly one machine in state `started`.
2. Read a bounded slice of recent logs. Do **not** run bare `fly logs` — it streams forever and will hang:
   ```bash
   fly logs --no-tail
   ```
3. Summarize for the developer:
   - The machine id, its state, and the release version `fly status` reports.
   - Whether the logs show a healthy startup: drizzle migrations applying (or nothing pending), the bot logging in to Discord's gateway, and the startup insight posted to `STARTUP_MESSAGE_DISCORD_CHANNEL`.
   - Any of the failure signatures documented in `docs/discord-bot/production-hosting.md`'s "Checking on the deployment" section, named explicitly when matched:
     - **Crash loop from missing or invalid configuration** — a thrown startup error such as `DATABASE_URL is not configured`, with `fly status` showing repeated restarts. The fix is to correct `apps/discord-bot/.env.production` and re-run `fly secrets import < apps/discord-bot/.env.production` by hand; this skill does not push secrets (see Non-goals).
     - **Stopped after max restarts** — `fly status` shows `stopped` and the logs show "machine has reached its max restart count". Fixing the secret alone does not bring it back; offer the "Restart the machine" action.
     - **Database unreachable** — a connection error during migration. Note that Neon's free tier autosuspends its compute after inactivity, so the first connection after a quiet period is slow by design and is not itself a failure.
4. This section never changes anything. If it finds a problem, report it and let the developer decide — do not restart, redeploy, or reset on your own initiative.

### Restart the machine

Run this section only if "Restart the machine" was selected in step 0 above. Runs after "Check deployment status" if both were selected; runs standalone if it is the only one picked.

1. Find the machine and its current state, in machine-readable form:
   ```bash
   fly status --json
   ```
   Read the machine's `id` and `state` from the JSON. If more than one machine is listed, stop and report — `fly.toml` describes a single always-on machine, so several machines means something unexpected happened and the developer should look before anything is restarted.
2. Pick the command by state, and tell the developer which one you are running and why:
   - State `stopped` (the max-restart-count case): start it explicitly.
     ```bash
     fly machine start <machine-id-from-step-1>
     ```
   - State `started` (a live restart, e.g. to clear a stuck gateway connection): replace the running machine in place.
     ```bash
     fly apps restart blood-bowl-tracker-discord-bot
     ```
   - Any other state (`starting`, `replacing`, …): report the state and stop. A machine mid-transition should be allowed to settle rather than have a second operation stacked on it; suggest re-running "Check deployment status" in a moment.
3. Wait for the machine to come back, polling rather than sleeping blindly:
   ```bash
   fly status
   ```
   Retry every few seconds up to about 60 seconds, until exactly one machine reports `started`.
4. Confirm the restart actually produced a healthy boot:
   ```bash
   fly logs --no-tail
   ```
   Look for the same healthy-startup markers as the "Check deployment status" section (migrations, Discord gateway login, startup message posted). A machine in state `started` whose logs show a thrown startup error is a crash loop, not a successful restart — report it that way.
5. Report the outcome: which command was run, the machine's final state, and what the logs showed. A restart does not change the deployed image; if the underlying problem is the code or config that was deployed, say so and point at the rollback and redeploy actions.

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
   Expect one machine in state `started` and a healthy startup. `fly releases` now shows a *new* release whose image is the old one — Fly records the rollback as a new release rather than reverting to the old release number.
7. Report to the developer: which release was rolled back to, its image reference, the new release version Fly created, and a reminder that `main` still carries the bad code.

### Trigger a redeploy without a new merge

Run this section only if "Trigger a redeploy without a new merge" was selected in step 0 above. Runs after the "Check deployment status", "Restart the machine", and "Roll back to a previous release" sections if those were also selected; runs standalone if it is the only one picked.

This dispatches the same `.github/workflows/deploy.yml` workflow that merges to `main` trigger, so it deploys whatever `main` currently points at — useful after pushing changed Fly secrets, after a rollback that needs undoing, or to retry a deploy that failed transiently. It is not a way to deploy a branch: the workflow always builds the ref it is dispatched against, and this skill always dispatches `main`.

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

## Non-goals

- **No normal deploys.** Merging to `main` deploys; this skill never runs `flyctl deploy` except as the mechanism of the rollback action, which deliberately deploys an *older* image.
- **No credential management.** The skill never runs `fly tokens create`, `gh secret set`, or `fly secrets import`. Creating the `FLY_API_TOKEN` secret and pushing `.env.production` to Fly stay manual, documented steps in `docs/discord-bot/production-hosting.md`.
- **No creating of gitignored production config.** `apps/discord-bot/.env.production` and the `tools/import-*/import-*-config.production.json5` files are authored once by a developer. This skill syncs them into a worktree and checks them, but never generates one from a template — same stance `deploy-local` takes on the local equivalents.
- **No backups.** There is no backup or restore of the Neon database; production data is reproducible by re-import, as `docs/discord-bot/production-hosting.md` documents.
- **No teardown.** The skill never stops or destroys the Fly machine or the Neon project.
