---
name: deploy-production
description: Use to operate the blood-bowl-tracker production deployment on Fly.io and Neon — check deployment status, apply the production configuration file to Fly as secrets, restart the machine, roll back to a previous release, trigger a redeploy of current main without a new merge, restore a backup into production, run read-only queries against the production database, or run the manual/BBL/TP importers against production
---

# deploy-production

Operates the already-deployed production Discord bot described in `docs/discord-bot/production-hosting.md`: status and log inspection, applying the already-authored production configuration file to Fly as secrets, machine restarts, rollbacks, on-demand redeploys, restoring a backup into production, read-only queries against the production database, and the production import runs (the four individual imports and the full import). Every action here is a wrapper around commands that page already documents by hand — when an action fails, that page is the fallback.

This skill does **not** perform normal deploys. Those happen automatically in GitHub Actions on every merge to `main` (`.github/workflows/deploy.yml`); the closest thing offered here is dispatching that same workflow against the current `main`.

## Invocation

```
/deploy-production
```

Takes no arguments.

## Preconditions

Preconditions 1 and 3 are true blocking preconditions for every action below — check them once, before step 0's question, and stop with a clear message if one fails. Precondition 2 (`gh` authentication) is needed only by the "Trigger a redeploy without a new merge" and "Restore a backup into production" actions; check it once step 0's selections are known, and only if one of those actions was selected (each of those two sections checks it at its own start). An unauthenticated `gh` CLI must never block a status check, applying production configuration, a restart, a rollback, or an import run — none of those use `gh` at all, and this matters most during an incident, when the developer may just want `fly status` and shouldn't be stopped by an unrelated tool. Precondition 4 (main checkout only) is likewise scoped to five specific actions and checked inside each of their own sections, not globally.

1. `flyctl` is installed and authenticated:
   ```bash
   fly auth whoami
   ```
   If this fails, tell the developer to run `flyctl auth login` themselves — it opens a browser for OAuth and needs a real interactive terminal, so this skill cannot do it for them.
2. `gh` is installed and authenticated — required only for "Trigger a redeploy without a new merge" and "Restore a backup into production" (see above), checked at the start of each of those two sections rather than here:
   ```bash
   gh auth status
   ```
3. Commands run from the repository root of the current checkout or worktree, where `fly.toml` lives. `fly.toml` is committed, so a worktree has it; the gitignored production files each action needs are synced by that action's own steps. Verify this before step 0's question — `git rev-parse --show-toplevel` is worktree-aware, so run from inside a worktree it returns that worktree's own root, which is exactly the reference point this precondition means:
   ```bash
   CURRENT_DIR=$(pwd -P)
   if ! REPO_ROOT=$(git rev-parse --show-toplevel 2>&1); then
     echo "NOT A GIT CHECKOUT — refuse (current directory: $CURRENT_DIR)"
   elif [ "$CURRENT_DIR" != "$REPO_ROOT" ]; then
     echo "NOT AT REPO ROOT — refuse (current directory: $CURRENT_DIR, repository root: $REPO_ROOT)"
   else
     echo "AT REPO ROOT — proceed"
   fi
   ```
   `pwd -P` resolves symlinks before comparing, matching `git rev-parse --show-toplevel`'s own physical-path output — plain `pwd` would falsely refuse if the developer reached the repository root through a symlinked path. The two refusal branches are printed with the actual paths already included, so there is nothing left to separately derive when reporting the outcome. If this printed either refusal line, refuse the **entire skill invocation** and stop before step 0's question is asked — every action below resolves paths relative to the repository root (`fly.toml`, `apps/discord-bot/.env.production`, the `tools/*` importer configs), so there is nothing left to run selectively. This differs from precondition 4, which refuses only its own section while other selected actions proceed. Report the printed line to the developer, along with that they can re-invoke this skill from the repository root (or from inside a git checkout at all, for the first refusal line). Nothing has been changed.
4. Five actions are restricted to the **main checkout** and refuse to run from a worktree: **"Apply production configuration"**, **"Restart the machine"**, **"Roll back to a previous release"**, **"Trigger a redeploy without a new merge"**, and **"Restore a backup into production"**. Each is a repo-wide, branch-independent operation on the whole deployment, and none is about the current branch's code (a redeploy dispatch always targets `main` regardless of what is checked out; a restart and a rollback do not touch code at all; a production restore does check the backup's migrations against the checkout it runs from, which is why that checkout must be the main one, kept up to date) — and the ones that use a file from disk, "Apply production configuration" and "Restore a backup into production", must use the main checkout's own `apps/discord-bot/.env.production` (and, for the restore, its own backup-cli config), not a worktree's possibly-stale synced copy of them. Like precondition 2, this is not checked globally before step 0: each of those five sections performs the check itself as its own first step, so an unrelated action selected alongside one of them (e.g. "Check deployment status") is never blocked by it, and refusing one section never abandons the others. Every other action stays unrestricted and is deliberately worktree-friendly — the production imports (the four individual ones and the full import) and read-only queries each copy the gitignored production files they need into the worktree, because they are commonly run from a feature's own worktree to validate that feature's data end-to-end, and "Check deployment status" is read-only.

## Steps

0. Ask the developer which action(s) to perform. There are twelve actions, and `AskUserQuestion` allows at most 4 options per question, so they are split across **three `multiSelect: true` questions sent in a single `AskUserQuestion` call** — the developer sees all three in sequence and answers once. Ask exactly these three questions, with exactly these options, in this order. Do not add, drop, reword, or reorder any option, and in particular do not add a "Both", "All", "None", or "Neither" option of your own invention — `multiSelect: true` already lets the developer pick any combination, including (by deselecting everything offered) none. See the `AskUserQuestion` option-ceiling and don't-invent-options rules in `CLAUDE.md`'s "Developer prompts" section for the rationale.

   All three questions are one decision split in three, so phrase them that way. The strings below are the `question` text; each also needs a short `header` of its own (`header` is capped at 12 characters, so the question text will not fit there) — e.g. `Run what`, `Run what 2`, `Run what 3`.

   **Question 1 — `question`: "Which action(s) should I run?"** (`multiSelect: true`):
   - **Check deployment status** — run `fly status` and a recent log tail, and summarize the machine's state.
   - **Apply production configuration** — main checkout only. Push `apps/discord-bot/.env.production` to Fly as secrets; this restarts the machines automatically.
   - **Restart the machine** — main checkout only. Start a stopped machine, or restart a running one.
   - **Roll back to a previous release** — main checkout only. Pick from Fly's release history and redeploy that image.

   **Question 2 — `question`: "Which action(s) should I run? (continued)"** (`multiSelect: true`):
   - **Trigger a redeploy without a new merge** — main checkout only. Dispatch the GitHub Actions deploy workflow against the current `main`.
   - **Restore a backup into production** — main checkout only. DESTRUCTIVE but undoable: stop both machines, take a safety backup, and replace production's data with a chosen backup in one transaction.
   - **Run the manual import (first batch) against production** — run `tools/import-manual/`'s `apply 001-initial-seed` command over a `flyctl proxy` tunnel (meant only for a brand-new, empty database).
   - **Run the BBL import against production** — run `tools/import-bbl/` over a `flyctl proxy` tunnel.

   **Question 3 — `question`: "Which action(s) should I run? (continued)"** (`multiSelect: true`):
   - **Run the TP import against production** — run `tools/import-tp/` over a `flyctl proxy` tunnel.
   - **Run the manual import (remaining batches) against production** — run `tools/import-manual/`'s plain `apply` command over a `flyctl proxy` tunnel; applies only batches production does not hold yet.
   - **Run the full import against production** — brand-new, empty database only (refused unless the manual-batch ledger is empty and no players, teams, coaches or competitions exist): run every importer in order over a `flyctl proxy` tunnel, `apply 001-initial-seed`, BBL, TP, plain `apply`, then BBL and TP again.
   - **Run read-only queries against production** — open a read-only `psql` session against the production database to answer a question the developer describes.

   The **union** of the three answers determines which sections below run; the split is purely a presentation constraint and carries no meaning of its own. The developer may select any combination of the twelve options, including none. Sections run in the order they appear below, which is the order the options are listed above, except as the full-import question below decides. No option is gated on any other: each section runs standalone if it is the only one picked. If the union is empty (nothing selected in any of the three questions), report "No action taken" and stop — this is a valid outcome, not an error.

   If the union holds "Run the full import against production" together with any of the four individual importers ("Run the manual import (first batch) against production", "Run the BBL import against production", "Run the TP import against production", "Run the manual import (remaining batches) against production"), stop and ask before running anything, with `AskUserQuestion` (single-select, `header` `Full import`), `question` "You selected Run the full import against production together with <the selected individual importers>. Should I run the full import only, or the full import followed by those importers?", with the options **Full import only** (skip the selected individual import sections) and **Full import, then the selected importers** (run the full import section first, then the selected individual import sections in their usual order, all inside the one tunnel). The other selected sections — status, configuration, restart, rollback, redeploy, backup restore, read-only queries — are unaffected and run in their usual places.

### Check deployment status

Run this section only if "Check deployment status" was selected in step 0 above. Runs first when several actions were selected — it is read-only, and its output is the context every other action is judged against. Runs standalone if it is the only one picked.

1. Get the machine list and state:
   ```bash
   fly status
   ```
   A healthy deployment shows **two** machines, both in state `started` — one active (connected to Discord), one standby. If only one machine is listed, this app hasn't been scaled to the 2-machine setup yet; see the "Active and standby" section of `docs/discord-bot/production-topology.md` rather than treating it as a fault (`fly scale count 2`, a one-time step).
2. Read a bounded slice of recent logs from both machines. Do **not** run bare `fly logs` — it streams forever and will hang:
   ```bash
   fly logs --no-tail
   ```
   Output interleaves both machines, each line prefixed with its machine id — use that prefix to tell which machine did what.
3. Summarize for the developer:
   - Each machine's id, state, and role (active or standby — see below), and the release version `fly status` reports.
   - Whether the logs show a healthy startup on each machine: drizzle migrations applying (or nothing pending), then either `Acquired the leader lock; becoming active` → Discord gateway login → `Posted active startup message`, or `Another machine holds the leader lock; standing by` → the standby message. A machine is active if its logs show the former; standby if the latter. Exactly one of the two machines should be active — flag it explicitly if both or neither are (see `docs/discord-bot/production-monitoring.md`'s "Common failures" entry "Both machines standby, none active").
   - Any of the failure signatures documented in `docs/discord-bot/production-monitoring.md`, named explicitly when matched:
     - **Crash loop from missing or invalid configuration** — a thrown startup error such as `DATABASE_URL is not configured`, with `fly status` showing repeated restarts. The fix is to correct `apps/discord-bot/.env.production` — a manual, developer-only edit (see Non-goals) — and then push it with the "Apply production configuration" action, which runs `fly secrets import < apps/discord-bot/.env.production` and restarts the machines. That action is main-checkout only (see Preconditions); if this session is in a worktree, say so when offering it, so the developer knows to re-invoke from the main checkout rather than selecting it here and hitting a refusal. This section never changes anything itself: report the finding and offer that action rather than running it unasked.
     - **Stopped after max restarts** — `fly status` shows `stopped` and the logs show "machine has reached its max restart count". Fixing the secret alone does not bring it back; offer the "Restart the machine" action.
     - **Database unreachable** — a connection error during migration. Note that Neon's free tier autosuspends its compute after inactivity, so the first connection after a quiet period is slow by design and is not itself a failure.
     - **`Lost the leader lock while active; exiting`** or **`Failed to complete startup after connecting to Discord; exiting`** — the active machine exited by design after losing the advisory lock or failing a step after connecting. A single occurrence is the intended reaction, and the standby should already have taken over; a repeating loop on the same machine points at the database dropping connections or a persistent Discord-side error worth reading from the surrounding log lines.
4. This section never changes anything. If it finds a problem, report it and let the developer decide — do not restart, redeploy, or restore on your own initiative.

### Apply production configuration

Run this section only if "Apply production configuration" was selected in step 0 above. Runs after "Check deployment status" if both were selected; runs standalone if it is the only one picked.

This pushes the current contents of `apps/discord-bot/.env.production` to Fly as the app's secrets — the manual step `docs/discord-bot/production-configuration.md` documents. It **applies** a file the developer has already authored; it never creates, edits, or fills in that file (see Non-goals). Pushing secrets makes Fly restart the machines automatically, so there is no need to chain the "Restart the machine" action after this one — this section does not invoke that one, and steps 4–5 below verify the automatic restart directly.

0. This action is restricted to the **main checkout** and must not run from a worktree (see the Preconditions section — it is a repo-wide, branch-independent operation, and the file it pushes belongs to the main checkout):
   ```bash
   MAIN_ROOT=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
   WORKTREE_ROOT=$(git rev-parse --show-toplevel)
   if [ "$MAIN_ROOT" != "$WORKTREE_ROOT" ]; then echo "WORKTREE — refuse"; else echo "MAIN CHECKOUT — proceed"; fi
   ```
   If this printed `WORKTREE — refuse`, this is a worktree: refuse and stop **this section only**, reporting that applying production configuration is a repo-wide, branch-independent operation restricted to the main checkout, that nothing was changed, and that the developer can re-invoke this skill from the main checkout to run it. Any other section selected in step 0 still runs normally.
1. Confirm the file to push actually exists:
   ```bash
   ls apps/discord-bot/.env.production
   ```
   If it is missing, stop and tell the developer to create it per `docs/discord-bot/production-configuration.md`. **Do not create it**, do not copy one from anywhere, and do not generate one from a template — authoring production credentials is a developer's job, not this skill's (see Non-goals). Never manually inspect this file yourself — no `Read` tool, `cat`, `grep`, or print of it or any individual value from it, at any point in this section, not even to diagnose a failed push: it holds every production credential. This does not forbid step 3's `fly secrets import < apps/discord-bot/.env.production`, which pipes the file straight to `fly` without its contents ever passing through you.
2. Warn and get an explicit confirmation before pushing anything. Use a plain conversational prompt rather than `AskUserQuestion` — this is a yes/no gate on a single path forward, which `CLAUDE.md`'s "Developer prompts" section explicitly allows a plain prompt for. Say plainly, in one message, that:
   - this sets or replaces, on Fly, every key present in the file — any value in the file that is stale or wrong becomes live — but it is **not** wholesale replacement: `fly secrets import` only sets the keys it's given and never unsets anything, so a secret already on Fly but absent from the file stays configured and untouched;
   - **this restarts the machines automatically** — Fly restarts on a secrets change, so the bot goes through a full reboot and leader re-election as a direct result of this action;
   - unlike restoring a backup into production, this is correctable: a wrong push is fixed by correcting the file and pushing again, which is why no typed phrase is required here.

   Only proceed on a clear affirmative. Anything else — a hesitation, a question, a request to see the file — is not a yes: stop this section, report that nothing was pushed, and continue with any other selected sections.
3. Push the secrets:
   ```bash
   fly secrets import < apps/discord-bot/.env.production
   ```
   `fly secrets import` reads `KEY=value` lines from stdin. Report only the command's own output — never echo the file into the transcript to "show what was pushed". If it fails on a malformed line, `fly`'s own parser error quotes that line verbatim, which can itself be a raw `KEY=VALUE` pair from the file: report only that the import failed and, if the error names a line number or a bare key, that much — never the parser's quoted line text itself, since it may carry a credential. For any other failure (an auth error), report the command's output as-is. Either way, do not assume nothing changed: `fly secrets import` can set the secrets before a deploy step it triggers afterward fails, so a non-zero exit does not guarantee production is unchanged. Continue to steps 4–5 to check the actual machine state before concluding anything, rather than stopping here.
4. Wait for the automatic restart to settle, polling rather than sleeping blindly:
   ```bash
   fly status
   ```
   Retry every few seconds up to about 60 seconds, until both machines report `started`. A healthy deployment has **two** machines (see "Check deployment status"); if fewer are listed, report that as a scaling gap, not as a failure of this action. If any machine instead reports `stopped` — the max-restart-count case documented in "Check deployment status" — stop polling immediately rather than waiting out the rest of the 60 seconds: correcting the secrets does not start a machine Fly has already stopped. Report that state explicitly and point the developer at the "Restart the machine" action (main checkout only) to bring it back.
5. Confirm the restart produced a healthy boot on both machines:
   ```bash
   fly logs --no-tail
   ```
   Look for the same healthy-startup markers as the "Check deployment status" section on each machine (migrations applying or nothing pending, then either `Acquired the leader lock; becoming active` or `Another machine holds the leader lock; standing by`). Because both machines restart at once, expect exactly one to win the lock; which one is not deterministic. A machine in state `started` whose logs show a thrown startup error — most likely `DATABASE_URL is not configured` or a similar missing/invalid value — means the file that was just pushed is wrong, not that the push failed: say so explicitly, and point at correcting `apps/discord-bot/.env.production` and re-running this action.
6. Report the outcome. State the import result on its own terms, separately from machine health — a machine ending up `started` does not mean the import itself succeeded (see step 4's note on stopped machines and step 3's note on partial application): say **"secrets pushed"** only if step 3 actually exited zero; otherwise say the import **failed** (or, in the rare case where step 3's own exit status couldn't be observed — e.g. the command timed out or the run was otherwise interrupted before it reported — **indeterminate**) and do not claim the file's contents are now live. Report that alongside each machine's final state and role (active/standby) and what the logs showed. If the logs show a configuration crash loop on one or both machines, say so precisely rather than assuming an outage: with **two** machines, one can crash-loop on the bad configuration while the other becomes active and keeps serving — that is reduced redundancy, not downtime. Say plainly that production is **down** only if neither machine can serve (both crash-looping, or the only other one already `stopped`/absent); otherwise report which machine is crash-looping and that the other is active. Either way, name only the failing configuration **key** (e.g. `DATABASE_URL`) and a sanitized description of the validation error — never the value itself, or any other logged line that could carry a credential.

### Restart the machine

Run this section only if "Restart the machine" was selected in step 0 above. Runs after the "Check deployment status" and "Apply production configuration" sections if those were also selected; runs standalone if it is the only one picked. If "Apply production configuration" already ran, its own push restarted both machines — check whether a second restart is actually wanted before running this one.

A healthy deployment has **two** machines (active + standby, see "Check deployment status"). This section restarts either a single stopped machine or all machines, never a subset chosen arbitrarily — a partial restart of "just the active one" isn't offered here because killing the active machine is exactly the leader-election failover path already exercised automatically (see `docs/discord-bot/production-topology.md`); use that machine's own crash/restart, not a manual restart of only it, if the intent is to force a handover.

0. This action is restricted to the **main checkout** and must not run from a worktree (see the Preconditions section — restarting the deployment is a repo-wide, branch-independent operation that has nothing to do with the current branch's code):
   ```bash
   MAIN_ROOT=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
   WORKTREE_ROOT=$(git rev-parse --show-toplevel)
   if [ "$MAIN_ROOT" != "$WORKTREE_ROOT" ]; then echo "WORKTREE — refuse"; else echo "MAIN CHECKOUT — proceed"; fi
   ```
   If this printed `WORKTREE — refuse`, this is a worktree: refuse and stop **this section only**, reporting that a restart is restricted to the main checkout, that nothing was changed, and that the developer can re-invoke this skill from the main checkout. Any other section selected in step 0 still runs normally.
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
   Look for the same healthy-startup markers as the "Check deployment status" section on each machine (migrations, then either the active or standby leader-election outcome). A machine restarting both at once means both race for the advisory lock fresh — expect exactly one to win and log `Acquired the leader lock; becoming active`, the other to log `Another machine holds the leader lock; standing by`; which one wins is not deterministic and does not need to match which one was active before. A machine in state `started` whose logs show a thrown startup error is a crash loop, not a successful restart — report it that way. A one-off migration error on one of the two machines immediately after a simultaneous restart is the documented migration-race failure mode (see `docs/discord-bot/production-monitoring.md`'s "Common failures") and self-heals on Fly's automatic retry; a repeating loop does not.
5. Report the outcome: which command was run, each machine's final state and role (active/standby), and what the logs showed. A restart does not change the deployed image; if the underlying problem is the code or config that was deployed, say so and point at the rollback and redeploy actions.

### Roll back to a previous release

Run this section only if "Roll back to a previous release" was selected in step 0 above. Runs after the "Check deployment status", "Apply production configuration", and "Restart the machine" sections if those were also selected; runs standalone if it is the only one picked.

0. This action is restricted to the **main checkout** and must not run from a worktree (see the Preconditions section — a rollback redeploys an image Fly already built, so it is a repo-wide operation independent of whatever branch is checked out):
   ```bash
   MAIN_ROOT=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
   WORKTREE_ROOT=$(git rev-parse --show-toplevel)
   if [ "$MAIN_ROOT" != "$WORKTREE_ROOT" ]; then echo "WORKTREE — refuse"; else echo "MAIN CHECKOUT — proceed"; fi
   ```
   If this printed `WORKTREE — refuse`, this is a worktree: refuse and stop **this section only**, reporting that a rollback is restricted to the main checkout, that nothing was changed, and that the developer can re-invoke this skill from the main checkout. Any other section selected in step 0 still runs normally.
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

Run this section only if "Trigger a redeploy without a new merge" was selected in step 0 above. Runs after the "Check deployment status", "Apply production configuration", "Restart the machine", and "Roll back to a previous release" sections if those were also selected; runs standalone if it is the only one picked.

This dispatches the same `.github/workflows/deploy.yml` workflow that merges to `main` trigger, so it deploys whatever `main` currently points at — useful after a rollback that needs undoing, or to retry a deploy that failed transiently. Like every deploy, the dispatched run first takes a fresh production backup and verifies it, so it takes a few minutes longer. (Applying changed Fly secrets does not need this: "Apply production configuration" already restarts the machines to pick them up on its own.) It is not a way to deploy a branch: the workflow always builds the ref it is dispatched against, and this skill always dispatches `main`.

0. Two checks before anything else, both stopping **this section only** if they fail (any other section selected in step 0 still runs normally):

   First, this action is restricted to the **main checkout** and must not run from a worktree (see the Preconditions section — the workflow always builds the ref it is dispatched against and this skill always dispatches `main`, so the dispatch is entirely independent of whatever branch is checked out):
   ```bash
   MAIN_ROOT=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
   WORKTREE_ROOT=$(git rev-parse --show-toplevel)
   if [ "$MAIN_ROOT" != "$WORKTREE_ROOT" ]; then echo "WORKTREE — refuse"; else echo "MAIN CHECKOUT — proceed"; fi
   ```
   If this printed `WORKTREE — refuse`, this is a worktree: refuse and stop, reporting that a redeploy dispatch is restricted to the main checkout, that nothing was dispatched, and that the developer can re-invoke this skill from the main checkout.

   Second, check that `gh` is installed and authenticated — this is the one action in this skill that needs it (see the Preconditions section):
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
   The most common failure is an expired or missing `FLY_API_TOKEN` secret, which surfaces as an authentication error from `flyctl`. Fixing it is a manual step (see `docs/discord-bot/production-first-time-setup.md`) — this skill does not mint or store tokens. If the failing job is `backup` or `verify` rather than `deploy`, nothing was deployed: read that job's log and see `docs/discord-bot/production-backups.md` (a missing storage setting names the GitHub environment to fix); the workflow has no way to skip them.
5. On success, verify the deployment the same way the rollback section does:
   ```bash
   fly status
   fly logs --no-tail
   ```
6. Report to the developer: the run URL, its conclusion, the release version before and after, and what the logs showed.

### Restore a backup into production

Run this section only if "Restore a backup into production" was selected in step 0 above. Runs after the "Check deployment status", "Apply production configuration", "Restart the machine", "Roll back to a previous release", and "Trigger a redeploy without a new merge" sections if those were also selected; runs standalone if it is the only one picked. Selected import and read-only-query sections run after it, against the restored data.

This replaces all production data in the application schemas with a backup — see `docs/discord-bot/production-restore.md` (the manual fallback) and `docs/backup-cli/index.md` (what `restore-production` checks and prints). Everything written since the backup is lost, which is why a safety backup is taken first, after the machines stop, so it is the exact final state. The restore itself is one transaction: it either fully succeeds or leaves production unchanged.

0. Two checks before anything else, both stopping **this section only** if they fail (any other section selected in step 0 still runs normally):

   First, this action is restricted to the **main checkout** (see the Preconditions section):
   ```bash
   MAIN_ROOT=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
   WORKTREE_ROOT=$(git rev-parse --show-toplevel)
   if [ "$MAIN_ROOT" != "$WORKTREE_ROOT" ]; then echo "WORKTREE — refuse"; else echo "MAIN CHECKOUT — proceed"; fi
   ```
   If this printed `WORKTREE — refuse`, refuse and stop, reporting that a production restore is restricted to the main checkout, that nothing was changed, and that the developer can re-invoke this skill from the main checkout.

   Second, check that `gh` is authenticated (the safety backup is a workflow dispatch):
   ```bash
   gh auth status
   ```
   If this fails, tell the developer to run `gh auth login` themselves and stop.
1. Confirm `apps/discord-bot/.env.production` sets `DATABASE_URL`, **without printing its value**:
   ```bash
   grep -c '^DATABASE_URL=' apps/discord-bot/.env.production
   ```
   Expected output: `1`. Anything else (0, more than one, or a missing file) — stop and report. Never read, `cat` or print this file. Then rebuild backup-cli — always, since a stale `dist/` can silently do something other than the source says:
   ```bash
   pnpm --filter "@blood-bowl-tracker/backup-cli..." run build
   ```
2. List the backups (this needs `tools/backup-cli/backup-cli-config.json5` with the read-only token; if it is missing, stop and point at `docs/backup-cli/index.md#configuration`):
   ```bash
   node tools/backup-cli/dist/main.js list
   ```
   It prints a JSON array, newest first, of `{ "key", "sizeBytes", "lastModified" }`. If the list is empty, report that there is nothing to restore and stop. Otherwise ask with `AskUserQuestion` (single-select, `header` `Backup`), `question` "Which backup should I restore into production?". Options: **Newest backup** first, its description giving the newest entry's full key, `lastModified` and size in MB; then one option per next most recent backup, up to three, each labelled with its `lastModified` timestamp and described by its full key and size (never truncate a key with "..."). The automatic "Other" entry lets the developer type any key, e.g. a safety backup to undo an earlier restore. Use the full chosen key in every later step. If the chosen backup is close to the 30-day retention limit (its `lastModified` more than about 28 days ago), warn the developer before continuing: the safety backup run in step 6 also prunes backups older than 30 days, so a backup near the edge can be deleted before step 7 downloads it. Suggest a more recent one unless they specifically need that one.
3. Dry run:
   ```bash
   node tools/backup-cli/dist/main.js restore-production <backup-key> --dry-run
   ```
   It prints `{ "mode": "dry-run", "key", "backup": { "migrations", "tableRowCounts" }, "production": { "tableRowCounts" } }`. Show the developer the backup's and production's key-table counts side by side, and keep them for step 9. A `null` in production's `tableRowCounts` means that key table does not exist in production (a damaged or missing `game_data` schema): say production's table was missing, not that the dry run failed — restoring over it is exactly what this action is for. On failure it prints `{"error": ...}` and nothing was touched: report the error and stop. An error listing migrations "absent from packages/db/migrations" usually means this main checkout is behind `origin/main`; say so and let the developer update it themselves — do not pull or fast-forward it as a side effect.
4. Require a typed confirmation. Ask the developer, in plain text, to reply with exactly:

   ```
   blood-bowl-tracker-discord-bot
   ```

   Say plainly in the same message that all production data will be overwritten with backup `<backup-key>`, that everything written since that backup will be lost from production, that both machines will be stopped (the bot is offline until step 8), and that a safety backup of the current state is taken first so the restore can be undone. Use a plain conversational prompt rather than `AskUserQuestion` — a button is too easy to click through by habit. Compare the reply character for character; anything else is a refusal: stop this section, report that nothing was changed, and continue with the other selected sections **except** the five "against production" import actions (the four individual imports and the full import) — if any of those were also selected in step 0, do not run them automatically. Report that they were skipped because the restore they were expected to follow did not happen, and that the developer can re-invoke the skill to run them deliberately against the existing, unmodified production data if that is actually what they want.
5. Stop both machines. First make sure no deploy is in flight, since a deploy replaces and starts machines:
   ```bash
   gh run list --workflow=deploy.yml --branch main --limit 1 --json databaseId,status,createdAt,url
   ```
   If its `status` is anything but `completed`, tell the developer and follow it with `gh run watch <databaseId>` before continuing. Then read the machine ids from:
   ```bash
   fly status --json
   ```
   Fewer or more than two machines: report it and stop this section (nothing changed yet). Otherwise note the current UTC time (`date -u +%Y-%m-%dT%H:%M:%SZ`) as the **stop time** for step 9, then for each machine:
   ```bash
   fly machine stop <machine-id>
   ```
   If `fly machine stop` reports an error for either machine, do not proceed: start any machine that did stop (`fly machine start <machine-id>`), report the error, and stop this section (nothing changed yet). Otherwise poll `fly status` every few seconds, up to about 60 seconds, until both report `stopped`. If either does not stop, start any machine that did stop, report, and stop this section. Tell the developer not to merge to `main` until step 8, and that Renovate also merges on its own: dependency PRs it automerges (`automerge: true` in `renovate.json5`) land on `main` without anyone clicking merge, and any merge to `main` triggers a deploy that starts the machines again. Step 9 checks whether that happened.
6. Take the safety backup:
   ```bash
   gh workflow run backup-production.yml --ref main
   ```
   Find the run, polling every few seconds for up to about 30 seconds until one appears created after the dispatch:
   ```bash
   gh run list --workflow=backup-production.yml --limit 1 --json databaseId,status,createdAt,url
   ```
   Follow it:
   ```bash
   gh run watch <databaseId> --exit-status
   ```
   If no run appears or it fails, **do not restore**: start both machines (`fly machine start <machine-id>` for each), report the failure (`gh run view <databaseId> --log-failed` for the reason), and stop this section. On success, list the backups again and take the newest key whose `lastModified` is after the dispatch as the **safety backup key**; report it to the developer now, before restoring:
   ```bash
   node tools/backup-cli/dist/main.js list
   ```
   Then check that the safety backup would itself be accepted, so the restore can really be undone:
   ```bash
   node tools/backup-cli/dist/main.js restore-production <safety-backup-key> --dry-run
   ```
   Skip this check when step 3's production counts had **any** key table `0` or `null` (empty or missing): `restore-production` refuses a backup in which any key table has no rows, so that safety backup is expected to fail it; tell the developer that the safety backup is not restorable by this action and that this restore's undo is therefore restoring an older backup or, with none usable, a full re-import from the source data, losing whatever production held that neither reproduces. Step 3's production read covers only the key tables, not drizzle's migrations table, so a damaged migrations table can still make the check fail. If the dry run prints `{"error": ...}`, do not hard-stop: show the developer the error, explain that the safety backup is not restorable by this action so the undo would be restoring an older backup or a full re-import, and ask with `AskUserQuestion` (single-select, `header` `Safety`), `question` "The safety backup would not be accepted for an undo. Restore anyway?", options **Restore anyway** (continue to step 7, accepting that undoing this restore means restoring an older backup or, with none usable, a full re-import) and **Stop and start the machines** (start both machines, report that nothing was restored, and stop this section).
7. Restore. First re-check that both machines are still stopped — a deploy (for example one triggered by a Renovate automerge) may have started them since step 5:
   ```bash
   fly status
   ```
   If either machine is not `stopped`, tell the developer, then check for a deploy in flight as in step 5 (follow it with `gh run watch <databaseId>` until it completes), stop each running machine again with `fly machine stop <machine-id>` and poll `fly status` until both report `stopped`, as in step 5. If they will not stay stopped, start both machines, report it, and stop this section (nothing restored). Only then restore:
   ```bash
   node tools/backup-cli/dist/main.js restore-production <backup-key> --confirm blood-bowl-tracker-discord-bot
   ```
   On success it prints `{ "mode": "restored", "key", "restoredMigrations", "tableRowCounts", "previousTableRowCounts" }`. On failure it prints `{"error": ...}`:
   - An error starting "Restored <key> into ..., but reading the restored database back failed" means the data is in place; continue to step 8 and report the error in step 10 without the counts.
   - Any other error means production is unchanged (download and inspection happen first, and the restore is one transaction). An error mentioning `lock timeout` means another connection held a lock on production's tables for over 60 seconds — check with `fly status` that both machines are still stopped before retrying. Report it, then ask with `AskUserQuestion` (single-select, `header` `Next step`), `question` "The restore failed and production is unchanged. What now?", options **Retry the restore** (run this step again) and **Start the machines without restoring** (go to step 8 and report that nothing was restored).
   - No JSON output at all (the command was interrupted, killed, or the session dropped) means production's state is **unknown**: the transaction may or may not have committed. Do not start the machines. Tell the developer, and mention that an interrupted run can leave a `backup-cli-restore-production-*` directory holding production data in the system temp directory, which they should delete. Then ask with `AskUserQuestion` (single-select, `header` `Next step`), `question` "The restore was interrupted and production's state is unknown. What now?", options **Retry the restore** (run this step again with the same key: it replaces the application schemas either way) and **Restore the safety backup** (run this step with the safety backup key instead, returning production to its state before the restore). If step 6's safety-backup check was skipped or failed, the safety backup would be refused, so do not offer it: retrying is the only path, so tell the developer in a plain prompt and retry. Continue to step 8 only after a restore succeeds.
8. Start both machines:
   ```bash
   fly machine start <first-machine-id>
   fly machine start <second-machine-id>
   ```
   Startup migrations apply anything newer than the backup. If `fly machine start` reports that a machine is already started (a deploy started it), that is fine: continue, and note it for step 9's deploy check.
9. Verify. First check whether a deploy ran while the machines were meant to be stopped:
   ```bash
   gh run list --workflow=deploy.yml --branch main --limit 5 --json databaseId,status,conclusion,createdAt,event,url
   ```
   If any run's `createdAt` is after step 5's stop time, report it to the developer (its URL, event and status): a deploy starts the machines, so the bot may have run during the restore window, writing data that the restore then replaced or applying migrations the restore then wiped. Wait for it to finish (`gh run watch <databaseId>`) if it is still running, then restart both machines so startup migrations run against the restored data, and check the logs below from that restart:
   ```bash
   fly apps restart blood-bowl-tracker-discord-bot
   ```
   Then poll `fly status` until both machines report `started` (up to about 60 seconds), then:
   ```bash
   fly logs --no-tail
   ```
   Check the same healthy-startup markers as "Check deployment status": migrations applying (the ones newer than the backup, or nothing pending), then exactly one machine logging `Acquired the leader lock; becoming active` and the other `Another machine holds the leader lock; standing by`. A one-off migration error on one machine right after both start is the documented migration race and self-heals; a repeating loop does not. Compare step 7's `tableRowCounts` with the dry run's backup counts from step 3 — they should match exactly; flag any difference.
10. Report: the restored backup key, the safety backup key, the restored migration count and which migrations startup applied on top, the key-table counts before (`previousTableRowCounts`, where a `null` means that table was missing from production before the restore — report it as missing, not as an error) and after, each machine's state and role, and the undo: run this action again and choose the safety backup key — unless step 6's safety-backup check was skipped or failed, in which case say that the safety backup cannot be restored by this action and the undo is restoring an older backup or a full re-import from the source data (the developer accepted that data loss).

### Production imports: shared setup

Run this section only if at least one of the five "against production" import actions (the four individual imports and the full import) was selected in step 0. It is not a menu option of its own — it is the setup those actions share, run once no matter how many of them were selected, immediately before the first of them.

Everything here automates the flow documented in `docs/discord-bot/production-imports.md`; read that page when something here fails.

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
2. Rebuild `tools/production-ops-cli` — unconditionally, every time this section runs, not only when `dist/main.js` is missing. A fresh worktree that only ran `pnpm install` has no build at all, but an *existing* `dist/` is the more dangerous case: it can have been built from an older commit and no longer match current source, and nothing in the tool's own output would say so. Steps 3, 6, and the teardown section below all invoke it, and all of them reach production. The trailing `...` in the filter rebuilds the tool's own workspace dependencies (today `tools/cli-shared`) too, so a stale dependency build cannot survive either:
   ```bash
   pnpm --filter "@blood-bowl-tracker/production-ops-cli..." run build
   ```
3. Check that the production config each selected import needs exists:
   ```bash
   ls tools/import-manual/import-manual-config.production.json5 \
      tools/import-bbl/import-bbl-config.production.json5 \
      tools/import-tp/import-tp-config.production.json5 2>&1
   ```
   If the file a selected import needs is missing, stop that import and tell the developer to create it once, from the same `import-*-config.example.json5` template as the local config, filling in the production `apiToken` from the matching `API_TOKEN_IMPORT_*` value in `apps/discord-bot/.env.production` — see `docs/discord-bot/production-imports.md`. **Do not create it from the template yourself**: a config copied from the example would carry a placeholder token and fail with `401`, and authoring production credentials is a developer's job, not this skill's (see Non-goals). A missing file for one tool does not block the other tools' imports. The full import needs all three files; a missing one stops the full import.
4. For each selected import whose production config exists (from step 3), check that its `apiBaseUrl` is exactly the tunnel's local port rather than a stale pre-migration value. This parses each config with JSON5 and compares `connection.apiBaseUrl` exactly, so a `localhost:30010` value or a `localhost:3001` mention elsewhere in the file (e.g. a comment) cannot pass it — the check lives in `tools/production-ops-cli` (see `check-production-config-port.service.ts`), not inline here, so it stays unit tested:
   ```bash
   node tools/production-ops-cli/dist/main.js check-production-config-port http://localhost:3001
   ```
   It prints `{"stale": [...]}` — an empty array means every existing production config already points at the right port. An entry here only matters for a *selected* import; a stale config for an import the developer didn't choose to run is not this run's problem. Most entries name a config whose `apiBaseUrl` doesn't match exactly (it very likely still has `localhost:3000` from before the tunnel's local port moved); an entry can also carry a `parseError` instead, when the file isn't valid JSON5 at all — either way, stop that import and tell the developer: for a mismatched `apiBaseUrl`, that it needs manual updating to `http://localhost:3001` (see the migration note in `docs/discord-bot/production-imports.md`); for a `parseError`, the parse error itself, since the file needs fixing by hand before it can be checked at all. **Do not edit the file yourself** — same stance as the missing-file case in step 3 (see Non-goals). A stale config for one tool does not block the other tools' imports, and one unparseable config does not stop the others from being checked.
5. Make sure nothing else is already bound to port 3001 — the port this tunnel uses. `deploy-local`'s docker-compose stack binds `3000`, not `3001`, so it is deliberately not a source of collision here; what this check guards against is another production tunnel already running (typically a concurrent `deploy-production` run in a different worktree), which would make the `flyctl proxy` below fail to bind:
   ```bash
   lsof -nP -iTCP:3001 -sTCP:LISTEN
   ```
   If anything is listening, stop and report what holds the port (typically a leftover `flyctl proxy 3001:3000` from an earlier or concurrent `deploy-production` run — see "Production imports: closing the tunnel"). Do not kill the process yourself.
6. Rebuild the import tools that will run — every run, and each one together with its own workspace dependencies. These builds were already unconditional; what the trailing `...` in each filter adds is the tool's dependency chain (for `import-tp`, that is `packages/import`, `packages/api-client`, `packages/api-contract`, `packages/domain-enums`, `packages/config-loader`, and `packages/parse-tp`). Rebuilding only the top-level tool package leaves a stale build of a dependency that changed independently in place, which is just as wrong as a stale build of the tool itself and just as invisible in the importer's own output. Build just the tools that were selected:
   ```bash
   pnpm --filter "@blood-bowl-tracker/import-manual..." run build   # if either manual import or the full import was selected
   pnpm --filter "@blood-bowl-tracker/import-bbl..." run build      # if the BBL import or the full import was selected
   pnpm --filter "@blood-bowl-tracker/import-tp..." run build       # if the TP import or the full import was selected
   ```
7. Open the private tunnel to the production machine. This spawns `flyctl proxy 3001:3000` detached (so it keeps running after this command returns) and persists its pid to a worktree-scoped, gitignored file, so the teardown section can target this run's own tunnel specifically rather than matching any process by command line — the logic lives in `tools/production-ops-cli` (see `production-tunnel.service.ts`), not as an inline shell script here, both because spawning a detached process and persisting its pid across separate tool invocations needs real process control a shell one-liner can't give it, and so it stays unit tested:
   ```bash
   node tools/production-ops-cli/dist/main.js start-production-tunnel 3001 3000
   ```
   It prints `{"pid": <n>}`. `3001` is the local port this tunnel listens on; `3000` is the production machine's own listening port (see `fly.toml`), which is unrelated to this change and stays `3000`. Because step 5's pre-flight check already refused to proceed if port 3001 was already bound, no other `flyctl proxy 3001:3000` can have bound it between then and this command running — the pid captured here is this run's own tunnel, unambiguously, even if that tunnel later dies and a different one starts on the now-free port before teardown runs.
8. Wait for the tunnel to accept connections before running any importer, polling for up to about 30 seconds:
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' --max-time 5 http://localhost:3001/rpc
   ```
   Any HTTP status at all (including `404` or `405`) means the tunnel is up — the RPC server answered. `curl` exiting with a connection error means it is not up yet. If it never comes up, report the tunnel command's own output, kill it (see "Production imports: closing the tunnel" below), and stop — running an importer against a dead tunnel just produces `ECONNREFUSED` for every record.

### Run the manual import (first batch) against production

Run this section only if "Run the manual import (first batch) against production" was selected in step 0. It runs after "Production imports: shared setup", which must have completed successfully. Runs standalone (no other import) if it is the only import picked — the shared setup and teardown still run around it. This batch is meant only for a brand-new, empty production database; on a database that already holds data it re-applies the initial seed over later curation, so a populated database takes the remaining-batches action instead.

1. Apply the first batch, with the production config selected by the environment variable:
   ```bash
   ( cd tools/import-manual && IMPORT_CONFIG_ENV=production node dist/main.js apply 001-initial-seed )
   ```
   `IMPORT_CONFIG_ENV` must be set on the same command as the tool — setting it in an earlier, separate shell call has no effect, and the tool would then silently use the local config and write to whatever `apiBaseUrl` that names.
2. Report the outcome. Per `tools/import-manual/src/main.ts` the tool exits `0` printing `Imported <N> record(s) successfully.` on stdout; or exits `1`, either printing `Import completed with <N> errors:` followed by each error message on stderr, or `Import failed:` with the thrown error for an unexpected failure. Report the exit code and the captured output either way.
3. Interpret common failures against production specifically, per `docs/discord-bot/production-imports.md`: `ECONNREFUSED` on `localhost:3001` means the tunnel died mid-run; `401` means the `apiToken` in the `.production.json5` file does not match the corresponding `API_TOKEN_IMPORT_*` secret pushed to Fly.
4. These are real writes to the production database with no rollback, so a failure partway through leaves earlier records in place. Do not attempt to undo them. If the developer wants production back as it was before the import, that is the "Restore a backup into production" action, chosen deliberately.
5. A failure here **does** stop the dependent imports: a first batch that failed is left unrecorded, so the BBL and TP imports would run without the records they match against, and a later plain `apply` would retry 001 before anything else. Skip the remaining selected BBL, TP and remaining-batches imports, report why, close the tunnel as usual, and tell the developer to rerun `apply 001-initial-seed` successfully before continuing.

### Run the BBL import against production

Run this section only if "Run the BBL import against production" was selected in step 0. Runs after "Production imports: shared setup" and after the manual first-batch import if that was also selected; runs standalone if it is the only import picked. On a brand-new database this import must run again after the remaining-batches import, because it reads the advancement costs batch 004 supplies; "Run the full import against production" does that automatically.

1. Run the importer:
   ```bash
   ( cd tools/import-bbl && IMPORT_CONFIG_ENV=production node dist/main.js )
   ```
2. Report the outcome. Per `tools/import-bbl/src/main.ts` the tool exits `0` printing `Imported <N> coach(es) successfully.` on stdout; or exits `1`, either printing `Import completed with <N> errors:` followed by each error message on stderr, or `Import failed:` with the thrown error. Report the exit code and the captured output.
3. This import is by far the longest of the four against production — each record is a separate call over the tunnel, so a full run takes considerably longer than it does locally. Do not treat a long-running import as a hang; only a stalled tunnel (repeated `ECONNREFUSED`) is a failure.
4. The same production failure interpretations and no-rollback caveat as the manual first-batch section apply here. A failure here does not skip the remaining selected imports — report it and continue, unless the manual first-batch import failed (then this one was already skipped).

### Run the TP import against production

Run this section only if "Run the TP import against production" was selected in step 0. Runs after "Production imports: shared setup", the manual first-batch import, and the BBL import if those were also selected; runs standalone if it is the only import picked. On a brand-new database this import must run again after the remaining-batches import, because it reads the advancement costs batch 004 supplies; "Run the full import against production" does that automatically.

1. Run the importer:
   ```bash
   ( cd tools/import-tp && IMPORT_CONFIG_ENV=production node dist/main.js )
   ```
2. Report the outcome. Per `tools/import-tp/src/main.ts` the tool exits `0` printing `Imported <N> record(s) successfully.` on stdout; or exits `1`, either printing `Import completed with <N> errors:` followed by each error message on stderr, or `Import failed:` with the thrown error. Report the exit code and the captured output.
3. The same production failure interpretations and no-rollback caveat as the manual first-batch section apply here. A failure here does not skip the remaining selected imports — report it and continue, unless the manual first-batch import failed (then this one was already skipped).

Unlike the BBL and manual imports, a team and its players are not imported by this local tool build at all: `tools/import-tp` only sends each roster file's raw content over the `tpRosters.import` RPC procedure, which `packages/import-tp-live` implements and which runs inside whatever `api-server` image is currently deployed to production — so a local-only change to team/player import logic has no effect on a production TP import until it is merged and deployed (see [docs/import-tp-live/index.md](../../../docs/import-tp-live/index.md)).

### Run the manual import (remaining batches) against production

Run this section only if "Run the manual import (remaining batches) against production" was selected in step 0. Runs last of the four individual imports, after every other selected individual import — its whole purpose is to clean up names and attach external IDs once the system-specific importers have run. Runs standalone if it is the only import picked.

1. **Before running anything, check the production ledger is initialised** — skip this check only when this run follows the first-batch import or the full import in the same run (a brand-new, empty database). Production imported before batch tracking existed has an empty ledger, and a plain `apply` there would re-import batches 001 and 002 and could overwrite later curation. Ask the developer with `AskUserQuestion` (single-select, `header` `Ledger`) whether `mark-applied 001-initial-seed 002-initial-cleanup` has already been run on production, with the options **Already marked** and **Not yet marked**. Alternatively, if they have an open read-only session, `select name from game_data.manual_import_batches` answers it. On **Not yet marked**, tell the developer the one-time remedy `( cd tools/import-manual && IMPORT_CONFIG_ENV=production node dist/main.js mark-applied 001-initial-seed 002-initial-cleanup )` and run it only on their explicit confirmation. Ask them to confirm first that production's last manual import ran from the current content of both batches — `mark-applied` imports nothing, so anything merged since would never reach production; if they cannot confirm it, import `data/batches/001-initial-seed` and `data/batches/002-initial-cleanup` by directory first (idempotent upserts), then mark them applied. The ledger calls also need the api-server release with the `manualImportBatches` procedures deployed — an older release answers them with 404.
2. Run plain `apply`, which applies every batch the production ledger does not record yet, in number order:
   ```bash
   ( cd tools/import-manual && IMPORT_CONFIG_ENV=production node dist/main.js apply )
   ```
3. Report the outcome using the same success/error/`Import failed:` formats as the manual first-batch section, plus the same production failure interpretations and no-rollback caveat.
4. On a brand-new database, the BBL and TP imports must run again after this one, because both read the advancement costs batch 004 supplies. If this run is building production from scratch and the BBL and TP imports are not run again after it, tell the developer so — "Run the full import against production" does this automatically.

### Run the full import against production

Run this section only if "Run the full import against production" was selected in step 0. It runs after "Production imports: shared setup", which must have completed successfully, inside the same tunnel. When it was selected together with individual importers, step 0's follow-up question decided whether those run right after it or not at all. Meant only for a brand-new, empty production database — the last-resort recovery path when no usable backup exists (see `docs/discord-bot/production-imports.md`).

This is the scratch-build sequence (see `docs/import-manual/batches.md`, "Operating procedure"): BBL and TP run twice because both read the advancement costs in batch 004, which can only be applied after their first run. Expect it to take many hours: it runs the BBL and TP imports, the longest against production, twice each.

1. **Guard: confirm production is a scratch build.** A scratch build has an empty manual-batch ledger *and* holds no players, teams, coaches or competitions — an empty ledger alone is not enough, because production imported before batch tracking existed, or after an ad hoc manual import (which records no ledger entry), has an empty ledger beside real data, and a plain `apply` there would re-import batches 001 and 002 over later curation. Make sure `apps/discord-bot/.env.production` is present in the worktree, exactly as "Run read-only queries against production" step 1 does. The query reads its `DATABASE_URL`, but the importers write through the deployed API, and a worktree copy that already existed is never overwritten — so also confirm the copy is not stale against the main checkout's, which is the file "Apply production configuration" pushes to Fly. Build the helper first — a fresh worktree has no `dist/` for it, and nothing else in this skill builds it:
   ```bash
   pnpm --filter "@blood-bowl-tracker/dev-workflow-cli..." run build
   ```
   Resolve the main checkout with `node tools/dev-workflow-cli/dist/main.js resolve-main-root` (printed `mainRoot`), then compare without printing either file:
   ```bash
   cmp -s "<main-root>/apps/discord-bot/.env.production" apps/discord-bot/.env.production && echo SAME || echo DIFFERENT
   ```
   Skip the comparison when `mainRoot` is this worktree itself. On `DIFFERENT`, stop this section: the guard could be reading a database other than the one the deployed API uses. Tell the developer the worktree's copy differs from the main checkout's and ask them to reconcile it; do not overwrite or edit it yourself. Matching files still do not prove the deployed API uses that `DATABASE_URL`, since a change may never have been applied to Fly, so also ask the developer with `AskUserQuestion` (single-select, `header` `Fly config`) "Has the main checkout's `apps/discord-bot/.env.production` been applied to Fly (\"Apply production configuration\") since its `DATABASE_URL` last changed?", with the options **Yes, it is applied** and **Not sure or not applied**. On the second, stop this section and suggest the \"Apply production configuration\" action first. Write this query to a scratch file with the `Write` tool and pipe it in, as that section's step 3 describes:
   ```sql
   select to_regclass('game_data.manual_import_batches') as ledger_table
   ```
   ```bash
   cat <scratch-file> | node tools/production-ops-cli/dist/main.js run-production-query
   ```
   If the result's `stdout` shows `ledger_table` empty (null), the table does not exist and the ledger is empty. Otherwise run, the same way:
   ```sql
   select count(*) as batches from game_data.manual_import_batches
   ```
   A count of `0` means the ledger is empty. Then confirm production holds no data, the same way:
   ```sql
   select (select count(*) from game_data.players) + (select count(*) from game_data.teams) + (select count(*) from game_data.coaches) + (select count(*) from game_data.competitions) as rows_total
   ```
   Continue to step 2 only when the ledger is empty and `rows_total` is `0`. Any other count, a non-zero `exitCode`, or an `{"error": ...}` from any of these queries means this is not a confirmed scratch build: stop this section, tell the developer the full import is for brand-new databases only (or report the query failure), and point them at the individual import options instead. A stopped full import also skips any individual importers chosen to follow it; say so. Close the tunnel as usual.
2. **Run the six steps in order**, each exactly as its individual section describes, with `IMPORT_CONFIG_ENV=production` on the same command as the tool, including that section's outcome report and production failure interpretations:
   1. `( cd tools/import-manual && IMPORT_CONFIG_ENV=production node dist/main.js apply 001-initial-seed )` — "Run the manual import (first batch) against production" steps 1–4.
   2. `( cd tools/import-bbl && IMPORT_CONFIG_ENV=production node dist/main.js )` — "Run the BBL import against production" steps 1–3.
   3. `( cd tools/import-tp && IMPORT_CONFIG_ENV=production node dist/main.js )` — "Run the TP import against production" steps 1–3.
   4. `( cd tools/import-manual && IMPORT_CONFIG_ENV=production node dist/main.js apply )` — "Run the manual import (remaining batches) against production" steps 2–3. Skip that section's ledger question (step 1): the guard confirmed production held no data at all, and step 2.1 just applied batch 001.
   5. `( cd tools/import-bbl && IMPORT_CONFIG_ENV=production node dist/main.js )` again, reported as in step 2.2.
   6. `( cd tools/import-tp && IMPORT_CONFIG_ENV=production node dist/main.js )` again, reported as in step 2.3.
3. **Failure handling.** Every non-zero exit stops the sequence — the later steps do not run, because they depend on what the failed step would have written — with exactly one exception. That includes a step 2.1 (`apply 001-initial-seed`) or 2.4 (plain `apply`) failure, an `Import failed:` crash, an exit with no recognized output at all (a killed process, a Node startup failure) and a dead tunnel. The exception is a BBL or TP step that exits `1` and prints `Import completed with <N> errors:` (a collected-error result) without `Import failed:`: it is reported and the sequence continues, exactly like the individual BBL and TP sections: the first pass may leave out a record whose curation only a later batch supplies, and the second pass after the plain `apply` repairs that. Report which step failed with its output, and which steps did not run. These are real production writes with no rollback; do not try to undo them. If step 2.1 failed, 001 is left unrecorded, but it may have written some records before failing. Re-run the guard: retry the full import only if it still reports an empty ledger and zero players, teams, coaches and competitions; otherwise continue with the individual import options from step 2.1 onward, ending with the BBL and TP imports again. For a stop at step 2.2 or later the ledger holds batch 001, so the guard refuses a second full import: tell the developer to continue with the individual import options from the failed step on, ending with the BBL and TP imports again. Any individual importers chosen to follow the full import are skipped too; say so. Close the tunnel as usual.
4. Report each step that ran with its exit code and summary line; "Production imports: closing the tunnel" step 3 includes them in its combined summary.

### Production imports: closing the tunnel

Run this section only if "Production imports: shared setup" ran. Like that section it is not a menu option — it is the teardown the import actions share, run once after the last selected import finishes, **regardless of whether the imports succeeded or failed**, and also on any early stop inside an import section.

1. Stop this run's own tunnel, using the pid persisted by `start-production-tunnel` rather than a broad process-name match — a `pkill` by command line alone cannot tell this run's tunnel apart from a different one that started after this run's own tunnel exited (e.g. a crash mid-import, followed by another developer's `deploy-production` run reusing the now-free port before this teardown fires):
   ```bash
   node tools/production-ops-cli/dist/main.js stop-production-tunnel
   ```
   It prints `{"stopped": true}` if it signaled a live process, or `{"stopped": false}` if there was no persisted tunnel or it had already exited on its own — either is a normal outcome, not a failure. Do not fall back to `pkill -f 'flyctl proxy 3001:3000'` — that broad pattern is exactly what risks stopping a different, unrelated tunnel.
2. Confirm the port is free again:
   ```bash
   lsof -nP -iTCP:3001 -sTCP:LISTEN
   ```
   Expected: no output. If something is still listening, tell the developer explicitly — a leftover tunnel will collide with the next `deploy-production` run's own tunnel. It will not collide with `deploy-local`, which binds `3000`.
3. Report a combined summary of every import that ran: which ones, their exit codes, record counts, and any errors. Say explicitly that the tunnel is closed, so the developer knows no private connection to production was left open.

### Run read-only queries against production

Run this section only if "Run read-only queries against production" was selected in step 0 above. Runs last — after every selected import section (and their tunnel teardown) if those were also selected, so its queries see whatever those imports wrote. Runs standalone if it is the only one picked.

This action answers a question the developer asks about live production data. There is deliberately **no fixed or pre-approved query list**: the useful queries change with whatever is being investigated, and a hardcoded list would only ever match the investigation that prompted writing it. The developer describes what they want to know; you write the SQL for it in the conversation, show it to them before running it, and run it inside a session the database itself holds read-only.

1. Make sure the production environment file is present. `apps/discord-bot/.env.production` is gitignored, so a worktree created fresh from a branch will not have it even though the main checkout does. Copy it from the main checkout only if missing, never overwrite a copy already in the worktree, and never create one from a template:
   ```bash
   MAIN_ROOT=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
   WORKTREE_ROOT=$(git rev-parse --show-toplevel)
   if [ "$MAIN_ROOT" != "$WORKTREE_ROOT" ] && [ ! -f "$WORKTREE_ROOT/apps/discord-bot/.env.production" ] && [ -f "$MAIN_ROOT/apps/discord-bot/.env.production" ]; then
     cp "$MAIN_ROOT/apps/discord-bot/.env.production" "$WORKTREE_ROOT/apps/discord-bot/.env.production"
   fi
   ```
   If the file exists in neither place, stop and tell the developer to create it per `docs/discord-bot/production-configuration.md`.
2. Ask the developer what they want to know, unless they already said. Use a plain conversational prompt rather than `AskUserQuestion` — the answer is free-form text, not a choice among options. Then write the SQL and show it to them before running it, with a one-line explanation of what each statement returns. Application tables live in the `game_data` schema (see `packages/db/src/schema/game-data/pg-schema.ts`) and the `discord_bot_usage` schema (see `packages/db/src/schema/discord-bot-usage/pg-schema.ts`), so qualify names as `game_data.<table>` or `discord_bot_usage.<table>` as appropriate.
3. Run the query through `tools/production-ops-cli`'s `run-production-query` subcommand (rebuild it first with `pnpm --filter "@blood-bowl-tracker/production-ops-cli..." run build` — always, not only when `dist/main.js` is missing, since an existing `dist/` can be stale relative to current source; the `...` suffix rebuilds the tool's own workspace dependencies too. This action can be run on its own, so it does its own rebuild rather than assuming another section already did one), feeding the query text via stdin. Write the query text to a scratch file with the `Write` tool first — not a shell heredoc: a heredoc's closing delimiter is still shell syntax, so a query that happened to contain a line matching the delimiter would end the heredoc early and let the rest of the query be parsed as shell commands. `Write` places the exact literal content on disk with no shell parsing at all, which closes that off completely rather than just making the delimiter harder to collide with. Then pipe the file into the subcommand:
   ```bash
   cat <scratch-file> | node tools/production-ops-cli/dist/main.js run-production-query
   ```
   This is why the process control lives here instead of as hand-rolled shell in this file: extracting and validating `DATABASE_URL` from `apps/discord-bot/.env.production`, and enforcing the query's read-only/timeout guarantees, all need real behavior a shell one-liner can't give safely — see `RunProductionQueryService` (`tools/production-ops-cli/src/run-production-query/run-production-query.service.ts`) and `ProductionEnvFileService` (`tools/cli-shared/src/production-env-file.service.ts`) for the implementation, and their specs for the behavior actually under test. Concretely:
   - The connection string is never echoed, and the command aborts before connecting if `DATABASE_URL` is missing or malformed (the file is parsed with dotenv, the same parser the bot uses, so quoting, CRLF line endings and an `export` prefix are handled as the bot handles them; the value must be a `postgres://` or `postgresql://` URL).
   - The query is passed to `psql` as a single `execFile` argument, not through a shell, so embedded single quotes, double quotes, or anything else in the developer-described SQL need no escaping and there is no heredoc-delimiter-collision risk to worry about — unlike a hand-written shell invocation of the same command.
   - The command rejects a blank query, and rejects any query whose trimmed text starts with `\` — `psql`'s `-c` accepts either SQL or a single psql meta-command, and `\!` in particular shells out on the *local* machine running this command, not the database, entirely outside the read-only transaction. Both checks run before `DATABASE_URL` is even read, let alone `psql` spawned. This means the SQL you write for the developer must always be plain SQL — never a psql meta-command, even one that looks harmless (`\dt`, `\d <table>`) — since none of them are accepted here.
   - The query runs wrapped in `BEGIN TRANSACTION READ ONLY; SET LOCAL statement_timeout = '30s'; <query>; COMMIT;`. `BEGIN TRANSACTION READ ONLY` is a database-enforced backstop, not a substitute for reading the query first: Postgres hard-errors on any write it reaches, including the non-obvious ones a visual review can miss (`SELECT ... FOR UPDATE`, `SELECT setval(...)`/`nextval(...)`, `SELECT ... INTO`, any `INSERT`/`UPDATE`/`DELETE`/DDL), and refuses `SET TRANSACTION READ WRITE` inside an already-read-only transaction — so nothing the query's own text can do flips it back before `COMMIT`. This is a defense against an accidentally wrong query, not a hardened defense against deliberately adversarial SQL crafted to smuggle in its own `COMMIT`/`BEGIN` pair to end-run the wrapping — closing that fully would need a dedicated, privilege-restricted read-only database role, which is out of scope here (see Non-goals).
   - `SET LOCAL statement_timeout = '30s'` bounds a normal accidentally-expensive query, but the query's own text runs inside that same transaction and could open with its own `SET LOCAL statement_timeout = 0;` to remove the bound before an expensive statement later on — a session/transaction-level setting alone is not a guarantee. A 35-second process-level deadline enforced by `ProcessRunnerService` (the same collaborator `GitRootsService`'s own git calls use) closes that specific gap: it sends `SIGTERM` — and escalates to `SIGKILL` if that's ignored — to the `psql` process itself if it's still running 35 seconds in, 5 seconds past the SQL-level timeout, so a normal slow query reports Postgres's own timeout error first. Unlike a SQL-level setting, nothing the query's own text can prevent an external process from delivering a signal to it, so this command is guaranteed to terminate and report `timedOut` either way — but killing the `psql` client is not the same as cancelling the query on the server: Postgres only notices the client disconnected the next time it tries to talk to it, so a statement the query deliberately kept unbounded may keep consuming production compute after this command has already returned, until it finishes or hits a server-side limit of its own. The transaction-level timeout is still the first, and normally sufficient, line of defense for that reason — the process deadline exists to bound this command's own runtime and guarantee it reports back, not to promise the database stopped working.
   - If `psql` is not installed, or the connection fails, the command reports that — Neon autosuspends idle compute, so a first connection after a quiet period is slow by design, and retrying once is reasonable before giving up.

   On success the command prints one JSON object to stdout: `exitCode`, `stdout`, `stderr`, and `timedOut` (`true` only when the 35-second process-level deadline killed it, including a query that tried to disable its own SQL-level timeout — report that case as "killed for running past the timeout", not as an ordinary query error). If the query was rejected before `psql` ever ran — blank, a meta-command, or a credential problem — the command instead exits non-zero, printing `{"error": "<message>"}` to stderr; report that message and do not retry with the same query.
4. Report the query that was run and the command's `stdout`/`stderr`. A non-zero `exitCode` (with `timedOut: false`) means the query itself failed — e.g. the read-only rejection, an `ON_ERROR_STOP` abort, or a syntax error — report `stderr` as the reason rather than treating any completed run as a success. Keep the output as-is rather than summarising away rows the developer asked to see; if it is very large, say how many rows came back and show a representative slice. Never print the connection string, and do not paste query output that would contain a credential.
5. If the developer has follow-up questions, repeat from step 2. Each one is a fresh `run-production-query` invocation with its own transaction — there is no session kept open across tool calls.

## Non-goals

- **No normal deploys.** Merging to `main` deploys; this skill never runs `flyctl deploy` except as the mechanism of the rollback action, which deliberately deploys an _older_ image.
- **No credential authoring.** The skill never runs `fly tokens create` or `gh secret set`, and never authors, edits, or generates `apps/discord-bot/.env.production`'s content. Creating the `FLY_API_TOKEN` secret and deciding what goes in `.env.production` stay manual, documented steps in `docs/discord-bot/production-first-time-setup.md`. Copying that file byte-for-byte from the main checkout into a worktree (see the read-only-queries action) is not authoring and remains allowed — it moves an already-authored file without changing its contents. The "Apply production configuration" action does run `fly secrets import < apps/discord-bot/.env.production`, but only to *apply* a file the developer already authored — pushing an existing file is a narrower, reversible operation than authoring credentials, and it never reads or prints the values it pushes.
- **No creating of gitignored production config.** `apps/discord-bot/.env.production` and the `tools/import-*/import-*-config.production.json5` files are authored once by a developer. This skill syncs them into a worktree and checks them, but never generates one from a template — same stance `deploy-local` takes on the local equivalents.
- **No automatic restore.** "Restore a backup into production" runs only when selected and confirmed with a typed phrase; this skill never restores on its own initiative, offers no point-in-time recovery, and never restores without first taking a safety backup.
- **No teardown.** The skill never destroys the Fly machines or the Neon project. The only time it stops machines is "Restore a backup into production", which always starts them again.
- **No dedicated read-only database role.** The read-only-queries action enforces its guard with an explicit `BEGIN TRANSACTION READ ONLY` and `SET LOCAL statement_timeout`, not a separate, privilege-restricted Postgres role — it connects with the same `DATABASE_URL` role every other action here uses. That closes accidental writes but not deliberately adversarial SQL crafted to smuggle in its own `COMMIT`/`BEGIN` pair. Provisioning and distributing credentials for a dedicated role is a real credential-management task, which this skill deliberately stays out of (see above).
