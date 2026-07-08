---
name: wrap-up
description: Use when the developer says feature work is finished (a PR merged, "we're done here", or similar) in the blood-bowl-tracker project — verifies the PR actually merged and nothing was stranded outside the worktree, then offers to stop local Docker containers and clean up the worktree and branch
---

# wrap-up

Verifies that development work the developer says is "done" is actually done, then offers to clean up the local state that `develop-feature`/`handle-pr-reviews` left behind (Docker containers, git worktree, local branch).

## Invocation

Triggered conversationally, not by a slash command — when the developer says something like "that's merged", "we're done here", or "the PR is in" about a specific piece of work. There is no `/wrap-up <arg>` form.

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

## Phase 2: Offer cleanup

Each of the following is its own `AskUserQuestion` checkpoint — offer them in this order, each with two genuine options ("Yes, stop it"/"Leave it running" or equivalent), per this project's `AskUserQuestion` convention:

1. **Docker containers.** Check whether `postgres` and/or `discord-bot` (the fixed container names `deploy-local` uses) are currently running:
   ```bash
   docker ps -a --filter "name=^postgres$" --filter "name=^discord-bot$" --format '{{.Names}}\t{{.Status}}'
   ```
   If either is `Up`, offer to stop them: `docker compose down`. Because `docker-compose.yml` uses fixed container names and a fixed `postgres_data` volume shared across every checkout and worktree of this repo (not one per piece of work), only offer to also delete the volume (`docker compose down -v`) if the developer explicitly confirms no other checkout or worktree still needs that data — never assume it's safe to delete automatically.
2. **Worktree removal.** If this session entered the worktree via `EnterWorktree`, offer `ExitWorktree` with `action: "remove"`. Otherwise, offer `git worktree remove <path>`.
3. **Branch deletion.** Offer to delete the local branch (`headRefName` from Phase 1) with `git branch -d <branch>` (not `-D` — a merged branch is always safe to delete with the safe flag; if it somehow isn't fully merged locally, report the error and let the developer decide rather than forcing it).

## Non-goals

- Does not touch the remote branch or the PR itself — GitHub already deletes the remote branch on merge by default for this repo's PRs.
- Does not run for in-progress work — only for work the developer has told Claude is finished, verified against GitHub.
