---
name: wrap-up
description: Use when the developer says feature work is finished (a PR merged, "we're done here", or similar) in the blood-bowl-tracker project — verifies the PR actually merged and nothing was stranded outside the worktree, then offers to stop local Docker containers and clean up the worktree and branch
---

# wrap-up

Verifies that development work the developer says is "done" is actually done, then offers to clean up the local state that `develop-feature`/`handle-pr-reviews` left behind (Docker containers, git worktree, local branch).

## Invocation

Most often triggered conversationally — when the developer says something like "that's merged", "we're done here", or "the PR is in" about a specific piece of work. The developer can also invoke it directly with `/wrap-up`; it takes no arguments, so identify the PR in question from conversation context either way (see Phase 1 step 1).

## Phase 1: Verify

1. Identify the PR in question from conversation context (a PR number, URL, or "the PR we just made"). If none can be identified, ask the developer which PR they mean via `AskUserQuestion` — this genuinely has no fixed second option, so if there's no clear alternative to offer, ask in plain conversational text instead (per this project's `AskUserQuestion` convention in `CLAUDE.md`).
2. Confirm it's actually merged — don't take the developer's word alone:
   ```bash
   gh pr view <N> --json state,mergedAt,headRefName
   ```
   If `state` is not `MERGED`, report that to the developer and stop — do not proceed to cleanup. Record `headRefName` (the branch name) for Phase 2.

   Then fetch so `origin/main` is current for the merge-base checks later in this cleanup:
   ```bash
   git fetch origin main
   ```
   This only updates the remote-tracking ref `origin/main`. It never checks out or otherwise touches the developer's local `main` branch.

   Steps 3 and 4 below invoke `tools/dev-workflow-cli`, so make sure it is compiled before running them:
   ```bash
   pnpm --filter @blood-bowl-tracker/dev-workflow-cli run build
   ```
   If this fails because dependencies are not installed in this checkout, run `pnpm install` first. A build failure here blocks steps 3 and 4 — report it and stop rather than skipping those checks.
3. Check for stranded work: commits on `headRefName` or uncommitted changes in the worktree that never made it into the merged PR (can happen if a developer commits directly in the worktree outside the normal task flow). Compare the merged PR's final commit against the local branch tip:
   ```bash
   git -C <worktree-path> log --oneline <merged-sha>..HEAD
   git -C <worktree-path> status --porcelain
   ```
   If either reports anything, ask the developer via `AskUserQuestion` with two genuine options: "Push as a follow-up PR" (commit any uncommitted changes, push the branch, open a new PR against the default branch) and "Discard" (the stranded work is not needed). Do not proceed to Phase 2 until this is resolved.

   Then also check the **main checkout** (the repo's primary working tree, distinct from this worktree) for stray commits **and** uncommitted changes left behind by an accidental edit outside the worktree:
   ```bash
   node tools/dev-workflow-cli/dist/main.js check-main-stray
   ```
   It prints `{"isWorktree": false}` outside a worktree — nothing to check, move on. Inside one it prints:
   ```json
   {
     "isWorktree": true,
     "uncommittedFiles": [{ "status": " M", "path": "path/to/file" }],
     "strayCommits": [{ "sha": "abc1234", "subject": "commit subject" }]
   }
   ```
   `status` is the raw 2-character `git status --porcelain` code (e.g. `" M"`, `"??"`, `"A "`) — needed below to tell a restorable edit apart from an untracked file. Apply the same logic as `develop-feature`'s and `handle-pr-reviews`' pre-push check: for each stray item, if it is **already part of the merged / worktree work** (the same content is committed on the merged branch or worktree — restoring on main loses nothing) it is safe to auto-clean on main; if its **provenance is unclear**, surface it and ask via `AskUserQuestion` — **never auto-discard**. To clean up, resolve the main checkout's path first with `node tools/dev-workflow-cli/dist/main.js resolve-main-root` and use its `mainRoot` value: for an `uncommittedFiles` entry whose `status` starts with `?` (untracked — `git restore`/`checkout --` is a no-op on these), delete it directly with `rm "<main-root>/<path>"`; for every other status code, use `git -C "<main-root>" restore <paths>` (reset redundant commits the same way). If the `git -C "<main-root>" ...` command itself is refused by the harness (worktree isolation), do not silently skip cleanup — print the exact command to the developer and ask them to run it themselves, e.g. by typing `! <command>` in their prompt (which runs it in their own session and returns its output into the conversation). This complements the worktree-side check above rather than replacing it. Do not proceed to Phase 2 until any stray main-checkout work is resolved.
4. Check for gitignored config drift — changes to gitignored config/env files that live only inside this worktree and would be lost when it is removed. `git status` never surfaces these, so they need their own check.
   ```bash
   node tools/dev-workflow-cli/dist/main.js check-drift
   ```
   The command detects worktree context itself and reports nothing outside a worktree (in a plain main checkout there is no second copy to compare against), so there is no separate detection step here. It compares a fixed list of gitignored files — the dev configs `develop-feature`'s Phase 1 syncs *into* a worktree, plus the `.production` variants — between this worktree and the main checkout. That list lives in `tools/cli-shared/src/gitignored-files.ts` (`GITIGNORED_DRIFT_FILES`); when a new tool config appears, add it there, in one place, rather than to a copy in this file. The `tools/import-bbl/data` and `tools/import-tp/data` directories are deliberately excluded: they are symlinked into the worktree rather than copied, so they always read through to the main checkout's files and cannot drift. A listed file that is absent from this worktree is not checked — there is nothing here to lose.

   Output:
   ```json
   {
     "drifted": [{ "path": "apps/discord-bot/.env", "diff": "< old\n---\n> new" }],
     "worktreeOnly": ["tools/review-match/review-match-config.json5"]
   }
   ```
   If both arrays are empty, nothing has drifted — continue to Phase 2.

   For **each** flagged file, first show the developer what is at stake:

   - **drifted** — show the entry's `diff` text verbatim (`<` lines are the main checkout's copy, `>` lines are this worktree's). The comparison was done by running `diff` on the two files, never by eyeballing their contents from separate reads — which has produced a false "identical" conclusion before.
   - **worktreeOnly** — state that the file exists only in this worktree and has no counterpart in the main checkout, so removing the worktree destroys the entire file, not just the latest edits.

   Then ask via `AskUserQuestion`, **one question per flagged file**, with these two genuine options (recommended first, per this project's `AskUserQuestion` convention):

   1. **"Copy into main checkout"** (recommended) — overwrite the main checkout's copy with the worktree's version, creating it (and any missing parent directory) in the worktree-only case, then report what was copied. Resolve both roots first with `node tools/dev-workflow-cli/dist/main.js resolve-main-root` and use its `mainRoot` and `worktreeRoot` values:
      ```bash
      mkdir -p "$(dirname "<main-root>/<file>")"
      cp "<worktree-root>/<file>" "<main-root>/<file>"
      ```
   2. **"Leave it"** — the worktree's version is not wanted in the main checkout.

   Never auto-resolve one of these files: they are gitignored, so there is no history to recover them from if the wrong copy wins. Do not proceed to Phase 2 until every flagged file has been resolved.

## Phase 2: Offer cleanup

Each of the following is its own `AskUserQuestion` checkpoint — offer them in this order, each with two or more genuine options ("Yes, stop it"/"Leave it running" or equivalent; the Docker checkpoint below offers two, three, or four depending on context), per this project's `AskUserQuestion` convention:

1. **Docker containers and images.** First detect worktree context the way the session already knows it (entered via `EnterWorktree`, or `git rev-parse --git-common-dir` differs from `git rev-parse --git-dir`) — the image-cleanup behaviour below only ever applies **inside a worktree**. Then check whether `postgres` and/or `discord-bot` (the fixed container names `deploy-local` uses) are currently running:
   ```bash
   docker ps -a --filter "name=^postgres$" --filter "name=^discord-bot$" --format '{{.Names}}\t{{.Status}}'
   ```
   **Inside a worktree only**, also resolve and look for the worktree-specific `discord-bot` image. `docker-compose.yml` sets no explicit `image:` for `discord-bot`, so Compose names it `<project>-discord-bot` where `<project>` defaults to the worktree directory's basename — a distinct image per worktree that today's cleanup never removes. Ask Compose for the exact name rather than re-deriving its project-naming rules by hand, then check whether that image exists locally:
   ```bash
   docker compose config --images   # prints resolved image names, one per line, e.g.:
                                     #   postgres:17-alpine
                                     #   issue-105-delete-docker-images-wrap-up-discord-bot
   docker images -q <resolved-discord-bot-image>   # non-empty if it exists locally
   ```
   Take the `discord-bot` image line from `docker compose config --images` (the one that is **not** `postgres:17-alpine`) as `<resolved-discord-bot-image>`. Only `discord-bot` is worktree-specific and cleaned up here — never `postgres:17-alpine`, which is a shared pulled base image with no worktree variant.

   Fire the combined Docker checkpoint if **either**: a `postgres` or `discord-bot` container is currently `Up`, **or** (inside a worktree only) `<resolved-discord-bot-image>` exists locally. Present it as a single `AskUserQuestion` (image deletion is merged into this one decision point, not a separate question), ordering the recommended option first per this project's `AskUserQuestion` convention. Choose the option set by context:

   - **Inside a worktree, at least one container is `Up`** → four options:
     1. **"Stop, delete volume and image"** (recommended) — `docker compose down -v`, then `docker rmi <resolved-discord-bot-image>`.
     2. **"Stop, delete volume, keep image"** — `docker compose down -v`.
     3. **"Stop, keep volume and image"** — `docker compose down`.
     4. **"Leave running"** — no action.
   - **Inside a worktree, no container is `Up` but `<resolved-discord-bot-image>` exists** → "stop" and "leave running" don't apply, so collapse to two options covering only the leftover volume and image:
     1. **"Delete volume and image"** (recommended) — `docker compose down -v` (a safe no-op if already stopped; also drops the network), then `docker rmi <resolved-discord-bot-image>`.
     2. **"Keep volume and image"** — no action.
   - **Outside a worktree** → unchanged from today. Image deletion is never offered here (the image name `blood-bowl-tracker-discord-bot` is stable across runs, not obsolete). Fire only when a container is `Up`, and present the existing three options — "Stop and delete volume" (`docker compose down -v`), "Stop, keep volume" (`docker compose down`), and "Leave running".

   Because `docker-compose.yml` uses a fixed `postgres_data` volume **shared across every checkout and worktree** of this repo (not one per piece of work), every prompt above must note in its options that the volume is shared across checkouts, so the developer can override the recommendation. Recommend **deleting** the volume inside a worktree (the database for this transient work is disposable; keep local Docker clean) and **keeping** it outside a worktree (protect the developer's long-lived default database).

   Run `docker rmi <resolved-discord-bot-image>` **after** the `docker compose down`/`down -v` call for any option that deletes the image — Compose will not remove an image still referenced by a container, so the container must be gone first.
2. **Worktree removal.** How to remove it depends on *how* this session entered it — `EnterWorktree` has two modes, and only one of them can be undone by `ExitWorktree(action: "remove")`. This depends on the *current* session's own history, which is only known when `wrap-up` runs in the same session that did the work; a fresh standalone session (see Invocation) has no transcript memory of how the worktree was originally entered and cannot distinguish cases 1 and 2 below — case 3, the catch-all, is always reachable and correct regardless.
   - **Entered via `EnterWorktree` in its `name` mode** (the normal `develop-feature`/`code-hygiene` case, which creates a new branch off the default branch) — offer `ExitWorktree` with `action: "remove"` **and** `discard_changes: true` on the **first** attempt — do not first try without the flag and react to a possible refusal. Phase 1 has already independently verified, via `gh pr view` (`state`/`mergedAt`) and the `git log`/`git status` comparison against the actual pushed branch, that the PR merged and nothing is stranded; that verification is authoritative. `ExitWorktree`'s own internal merge check tracks the branch by its creation-time name (`worktree-<name>`), which is also its permanent name — `develop-feature` never renames a worktree branch — so that check has no stale-name failure mode. Passing `discard_changes: true` unconditionally is nonetheless correct: Phase 1's verification is the authoritative one, so the flag never depends on `ExitWorktree`'s internal check agreeing.
   - **Entered via `EnterWorktree` in its `path` mode** (a worktree that already existed via a plain `git worktree add` before being entered — e.g. `finish-renovate-pr`'s worktree, checked out on Renovate's own branch) — `ExitWorktree(action: "remove")` explicitly refuses to remove a worktree entered this way. Instead, first call `ExitWorktree(action: "keep")` to return the session to the main checkout, then, now back in the main checkout, offer a plain `git worktree remove <path>`.
   - **This session did not enter the worktree via `EnterWorktree`** (isolation was declined, or `/wrap-up` was invoked in a fresh session that never itself entered the worktree — `ExitWorktree` is a documented no-op outside an active `EnterWorktree` session, so it cannot help here) — offer a plain `git worktree remove <path>`; no session-relocation step is needed.

   When the current session's history can't distinguish cases 1 and 2 (the fresh-session situation above), fall back to what's always safe: `ExitWorktree(action: "keep")` (a documented no-op if no `EnterWorktree` session is active in this fresh session) followed by a plain `git worktree remove <path>` — this works correctly in all three cases. The `name`-mode bullet's `ExitWorktree(action: "remove", discard_changes: true)` is an optimization, not a strict requirement — it also deletes the branch atomically, but step 3 below deletes the local branch independently anyway, so falling back costs nothing but that atomicity.
3. **Branch deletion.** Offer to delete the local branch (`headRefName` from Phase 1). Verify and delete against `origin/main` — **not** against the developer's local `main`, which may be stale or never fetched (the failure mode `git branch -d` would hit). First confirm the branch's work is genuinely present in `origin/main`:
   ```bash
   git merge-base --is-ancestor <branch> origin/main
   ```
   - **If it succeeds (exit 0):** the branch's work is confirmed present in `origin/main`, so delete it with force — the force is justified specifically by this independent check, not used blindly, and it sidesteps `-d`'s own merge check (which is relative to local `main` and can be stale or never-fetched):
     ```bash
     git branch -D <branch>
     ```
   - **If it fails (exit 1):** report that the branch does not appear merged into `origin/main` and stop — let the developer decide, the same fallback behavior as before, just driven by an authoritative check.

   This step must **never** check out, fast-forward, pull, or otherwise mutate the developer's local `main` branch. Verification and deletion happen entirely via `origin/main` and the target branch.

## Non-goals

- Does not touch the remote branch or the PR itself — GitHub already deletes the remote branch on merge by default for this repo's PRs.
- Does not run for in-progress work — only for work the developer has told Claude is finished, verified against GitHub.
