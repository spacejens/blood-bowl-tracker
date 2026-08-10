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
3. Check for stranded work: commits on `headRefName` or uncommitted changes in the worktree that never made it into the merged PR (can happen if a developer commits directly in the worktree outside the normal task flow). Compare the merged PR's final commit against the local branch tip:
   ```bash
   git -C <worktree-path> log --oneline <merged-sha>..HEAD
   git -C <worktree-path> status --porcelain
   ```
   If either reports anything, ask the developer via `AskUserQuestion` with two genuine options: "Push as a follow-up PR" (commit any uncommitted changes, push the branch, open a new PR against the default branch) and "Discard" (the stranded work is not needed). Do not proceed to Phase 2 until this is resolved.

   Then also check the **main checkout** (the repo's primary working tree, distinct from this worktree) for stray commits **and** uncommitted changes left behind by an accidental edit outside the worktree:
   ```bash
   MAIN_ROOT=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
   if [ "$MAIN_ROOT" != "$(git rev-parse --show-toplevel)" ]; then
     git -C "$MAIN_ROOT" status --porcelain
     git -C "$MAIN_ROOT" log --oneline @{u}..HEAD 2>/dev/null
   fi
   ```
   Apply the same logic as the pre-push check: for each stray item, if it is **already part of the merged / worktree work** (the same content is committed on the merged branch or worktree — restoring on main loses nothing) it is safe to auto-clean on main (`git -C "$MAIN_ROOT" restore <paths>`, reset redundant commits); if its **provenance is unclear**, surface it and ask via `AskUserQuestion` — **never auto-discard**. This complements the worktree-side check above rather than replacing it. Do not proceed to Phase 2 until any stray main-checkout work is resolved.
4. Check for gitignored config drift — changes to gitignored config/env files that live only inside this worktree and would be lost when it is removed. `git status` never surfaces these, so they need their own check.

   This step runs **only inside a git worktree** — detect worktree context the same way Phase 2's Docker step does (this session entered via `EnterWorktree`, or `git rev-parse --git-common-dir` differs from `git rev-parse --git-dir`). In a plain main checkout there is no second copy to compare against, so skip this step silently.

   Compare a **fixed list** of gitignored files between this worktree and the main checkout. The list mirrors the files `develop-feature`'s Phase 1 setup syncs *into* a fresh worktree, plus the production config variants:

   - `apps/discord-bot/.env`
   - `apps/discord-bot/.env.production`
   - `tools/download-tp/download-tp-config.json5`
   - `tools/import-bbl/import-bbl-config.json5`
   - `tools/import-bbl/import-bbl-config.production.json5`
   - `tools/import-tp/import-tp-config.json5`
   - `tools/import-tp/import-tp-config.production.json5`
   - `tools/import-manual/import-manual-config.json5`
   - `tools/import-manual/import-manual-config.production.json5`
   - `tools/review-match/review-match-config.json5`

   The list is hardcoded here on purpose, matching how `develop-feature` hardcodes its own copy — keep the two in sync by eye when a new tool config appears. The `tools/import-bbl/data` and `tools/import-tp/data` directories are deliberately **excluded**: `develop-feature` symlinks them into the worktree rather than copying, so they always read through to the main checkout's files and cannot drift.

   Classify each listed file:

   ```bash
   WORKTREE_ROOT=$(git rev-parse --show-toplevel)
   MAIN_ROOT=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
   if [ "$MAIN_ROOT" != "$WORKTREE_ROOT" ]; then
     for f in apps/discord-bot/.env apps/discord-bot/.env.production \
              tools/download-tp/download-tp-config.json5 \
              tools/import-bbl/import-bbl-config.json5 \
              tools/import-bbl/import-bbl-config.production.json5 \
              tools/import-tp/import-tp-config.json5 \
              tools/import-tp/import-tp-config.production.json5 \
              tools/import-manual/import-manual-config.json5 \
              tools/import-manual/import-manual-config.production.json5 \
              tools/review-match/review-match-config.json5; do
       if [ ! -e "$WORKTREE_ROOT/$f" ]; then
         continue                                  # not in the worktree — nothing to check
       elif [ ! -e "$MAIN_ROOT/$f" ]; then
         echo "WORKTREE-ONLY: $f"
       elif ! diff -q "$MAIN_ROOT/$f" "$WORKTREE_ROOT/$f" >/dev/null; then
         echo "DRIFTED: $f"
       fi
     done
   fi
   ```

   Always decide by running `diff` on the two files — never by eyeballing their contents from separate reads, which has produced a false "identical" conclusion before.

   For **each** flagged file, first show the developer what is at stake:

   - **DRIFTED** — show the actual differences (`<` lines are the main checkout's copy, `>` lines are this worktree's):
     ```bash
     diff "$MAIN_ROOT/<file>" "$WORKTREE_ROOT/<file>"
     ```
   - **WORKTREE-ONLY** — state that the file exists only in this worktree and has no counterpart in the main checkout, so removing the worktree destroys the entire file, not just the latest edits.

   Then ask via `AskUserQuestion`, **one question per flagged file**, with these two genuine options (recommended first, per this project's `AskUserQuestion` convention):

   1. **"Copy into main checkout"** (recommended) — overwrite the main checkout's copy with the worktree's version, creating it (and any missing parent directory) in the worktree-only case, then report what was copied:
      ```bash
      mkdir -p "$(dirname "$MAIN_ROOT/<file>")"
      cp "$WORKTREE_ROOT/<file>" "$MAIN_ROOT/<file>"
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
2. **Worktree removal.** If this session entered the worktree via `EnterWorktree`, offer `ExitWorktree` with `action: "remove"` **and** `discard_changes: true` on the **first** attempt — do not first try without the flag and react to a possible refusal. Phase 1 has already independently verified, via `gh pr view` (`state`/`mergedAt`) and the `git log`/`git status` comparison against the actual pushed branch, that the PR merged and nothing is stranded; that verification is authoritative. `ExitWorktree`'s own internal merge check tracks the branch by its pre-rename, creation-time name (`worktree-<name>`) and can misreport an already-merged, renamed branch as having commits that would be discarded — Phase 1's check supersedes it, so there's no need to rely on it agreeing. Otherwise (the session did not enter via `EnterWorktree`), offer `git worktree remove <path>`.
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
