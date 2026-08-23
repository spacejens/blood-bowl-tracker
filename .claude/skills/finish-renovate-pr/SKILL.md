---
name: finish-renovate-pr
description: Use when a Renovate dependency-update PR in the blood-bowl-tracker project is stuck — takes one Renovate PR number, investigates why it did not auto-merge (failing CI, a breaking change, or a bump configured to need manual review), makes whatever code changes the update needs, and pushes them back onto Renovate's own branch so the existing PR is updated in place
---

# finish-renovate-pr

Takes one stuck Renovate pull request and carries it to a mergeable state: investigating why it did not auto-merge, reviewing how the updated dependency is used in this codebase, making whatever code changes are needed, and pushing the fix back onto Renovate's own existing branch.

Renovate opens dependency-update PRs on its own, configured by `renovate.json5` at the repo root. Patch updates from the npm manager automerge once CI passes; everything else — minor and major bumps, Docker tag updates, anything whose CI fails — sits open waiting for a human. This skill is the "go finish PR #NNN" entry point for one of those, chosen by the developer.

See [docs/development-workflow.md](../../../docs/development-workflow.md) for the human-readable explanation of how this fits with the other skills.

## Invocation

```
/finish-renovate-pr 544
```

Takes a **pull request** number, not an issue number — Renovate PRs have no linked issue. Exactly one PR per invocation: batch triage of several stuck Renovate PRs is deliberately out of scope.

## Relationship to develop-feature

Like `code-hygiene`, this skill is built on top of `develop-feature`'s phases rather than duplicating them — read `.claude/skills/develop-feature/SKILL.md` and follow those phases, with the differences spelled out below. Two of its sections apply here verbatim and are not restated: **"Subagent dispatch discipline"** (every subagent's shell command carries a `cd <worktree-path> &&` prefix, and every reported commit is verified with `git log --oneline -1` / `git branch --show-current`) and **"Worktree isolation and shell commands"** (single-command invocations only; multi-statement blocks are refused).

Three things differ from every other `develop-feature`-based skill:

1. It claims a **PR**, not an issue, and checks the worktree out on **Renovate's existing branch** rather than creating a new one.
2. It has no Specification or Planning phase. What needs fixing varies per dependency, so a single **Investigation** step (Phase 2) stands in for both.
3. It **does not open a PR**. Fixes are pushed onto Renovate's branch, updating the existing PR in place, so its number, its `renovate:<updateType>` label, and its review history all stay intact.

## Phases

Work through each phase in order. Transitions marked **Pause** wait for the developer's explicit confirmation; every other transition prints a brief status line and continues immediately.

---

### Phase 1: Setup & claiming

1. **Fetch the PR.**
   ```bash
   gh pr view <PR> --json number,title,body,headRefName,state,author,labels,url,assignees,statusCheckRollup
   ```
   Stop, reporting why, on any of these:
   - The command errors (the PR number does not exist).
   - `state` is not `OPEN` — report "PR #<PR> is not open (state: `<state>`). Nothing to do."
   - The PR was not opened by Renovate — report "PR #<PR> was not opened by Renovate — this skill only operates on Renovate PRs."

   **How to recognise Renovate:** `author.is_bot` must be `true` **and** `author.login`, lowercased, must be one of `app/renovate`, `renovate[bot]`, or `renovate`. The `gh` CLI prints `app/renovate` for this repo's Renovate app installation (verified against PRs #535, #543, #544); `renovate[bot]` is the login the same account has through other GitHub APIs, and bare `renovate` is what GraphQL returns. Accept all three rather than pinning to one — a single hard-coded spelling would reject every real Renovate PR the moment `gh` changes which one it surfaces.

   If `assignees` is non-empty and does not include the current `gh` user (`gh api user --jq .login`), report "PR #<PR> is already assigned to `<assignee login(s)>`. Stopping." and **stop** — the same claim guard `develop-feature` applies to issues. If the `gh api user` call itself fails, report a one-line warning, skip the assignee comparison and step 2's assign/label, and continue to step 3.

   Record `headRefName`, `title`, `body`, `labels`, and `statusCheckRollup` — Phase 2 reads all of them.

2. **Claim it.**
   ```bash
   gh pr edit <PR> --add-assignee @me
   gh pr edit <PR> --add-label "in progress"
   ```
   Run these as two separate commands so a failure in one does not mask the other. Either failure is a one-line warning and the run **continues** — matching `develop-feature`'s assign/label failure tolerance. Do not add a kind label (`feature`/`bug`/`development`): a Renovate PR already carries its own `renovate:<updateType>` label, and this skill opens no PR that would need one.

3. **Create a worktree on Renovate's existing branch.** This is a deliberate departure from `develop-feature`'s Setup phase, which uses `superpowers:using-git-worktrees`' native `EnterWorktree` tool. That tool only ever creates a *new* branch off the default branch; this skill needs the worktree checked out on `headRefName` itself, because fixes must land on that exact branch to update the existing PR. So use the plain git-worktree fallback path (`superpowers:using-git-worktrees` Step 1b) instead:
   ```bash
   git fetch origin <headRefName>
   ```
   ```bash
   git worktree add .claude/worktrees/<worktree-dir> <headRefName>
   ```
   `<worktree-dir>` is `headRefName` with every `/` replaced by `-` (e.g. branch `renovate/discordjs-rest-undici-8.x` → directory `.claude/worktrees/renovate-discordjs-rest-undici-8.x`) — a directory name cannot contain the slash, but the **branch name is never renamed or sanitized**. `develop-feature`'s mandatory `git branch -m worktree-<name> <name>` rename step has no counterpart here and must not be performed: the branch must stay byte-for-byte what Renovate created.

   Verify before continuing:
   ```bash
   git branch --show-current
   ```
   Expected: exactly `headRefName`. Anything else — stop and report.

4. **Link the plans directory**, so Phase 2's investigation summary is saved outside the worktree and survives its removal. Identical to `develop-feature`'s Setup step 8:
   ```bash
   MAIN_ROOT=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
   if [ "$MAIN_ROOT" != "$(pwd)" ]; then
     mkdir -p "$MAIN_ROOT/docs/plans"
     if [ -e docs/plans ]; then
       echo "Warning: docs/plans already exists in the worktree; leaving it as-is instead of symlinking to $MAIN_ROOT/docs/plans"
     else
       ln -s "$MAIN_ROOT/docs/plans" docs/plans
     fi
   fi
   ```

5. **Install and build**, so later steps do not fail on an unbuilt workspace dependency and so `tools/ai-helpers` exists as compiled output for step 6:
   ```bash
   pnpm install
   ```
   ```bash
   pnpm build
   ```
   A failure here is **expected and informative** on this skill's PRs, unlike on `develop-feature`'s: the dependency bump under investigation is itself a plausible cause. Do not stop on it. Record the failure output verbatim — it is Phase 2's first and best evidence — and continue to step 6.

6. **Sync gitignored worktree files**, identical to `develop-feature`'s Setup step 10:
   ```bash
   node tools/ai-helpers/dist/main.js sync-gitignored
   ```
   If `dist/main.js` is missing because step 5's build failed, build just that package first: `pnpm --filter @blood-bowl-tracker/ai-helpers run build`. Report the printed `copied`/`symlinked`/`skipped` counts in step 7's status line; a non-zero exit prints `{"error": "<message>"}` — report it and continue (a missing gitignored config does not block a dependency-bump investigation).

7. Print a brief status line — worktree path, branch, whether `pnpm install`/`pnpm build` succeeded, and the sync counts — then continue immediately into Phase 2.
