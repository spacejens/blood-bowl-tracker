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

## Phase 2: Offer cleanup

Each of the following is its own `AskUserQuestion` checkpoint — offer them in this order, each with two or more genuine options ("Yes, stop it"/"Leave it running" or equivalent; the Docker checkpoint below offers three), per this project's `AskUserQuestion` convention:

1. **Docker containers.** Check whether `postgres` and/or `discord-bot` (the fixed container names `deploy-local` uses) are currently running:
   ```bash
   docker ps -a --filter "name=^postgres$" --filter "name=^discord-bot$" --format '{{.Names}}\t{{.Status}}'
   ```
   If either is `Up`, offer to stop them, and — because `docker-compose.yml` uses fixed container names and a fixed `postgres_data` volume **shared across every checkout and worktree** of this repo (not one per piece of work) — also offer whether to delete that volume. Detect worktree context the way the session already knows it (entered via `EnterWorktree`, or `git rev-parse --git-common-dir` differs from `git rev-parse --git-dir`). Present the choice via `AskUserQuestion` with genuine options — "Stop and delete volume" (`docker compose down -v`), "Stop, keep volume" (`docker compose down`), and "Leave running" — ordering the recommended option first per this project's `AskUserQuestion` convention:
   - **Inside a worktree** → recommend **deleting** the volume (the database for this transient work is disposable; keep local Docker clean).
   - **Outside a worktree** → recommend **keeping** the volume (protect the developer's long-lived default database).
   Either way, note in the prompt that the volume is shared across checkouts so the developer can override the recommendation.
2. **Worktree removal.** If this session entered the worktree via `EnterWorktree`, offer `ExitWorktree` with `action: "remove"`. Otherwise, offer `git worktree remove <path>`.
3. **Branch deletion.** Offer to delete the local branch (`headRefName` from Phase 1) with `git branch -d <branch>` (not `-D` — a merged branch is always safe to delete with the safe flag; if it somehow isn't fully merged locally, report the error and let the developer decide rather than forcing it).

## Non-goals

- Does not touch the remote branch or the PR itself — GitHub already deletes the remote branch on merge by default for this repo's PRs.
- Does not run for in-progress work — only for work the developer has told Claude is finished, verified against GitHub.
