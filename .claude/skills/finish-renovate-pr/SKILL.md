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

---

### Phase 2: Investigation

Stands in for `develop-feature`'s Specification (Phase 2) and Planning (Phase 3) phases. There is no brainstorming, no approval gate on a spec, and no enumerated task plan — a dependency bump is a single, already-decided change, and the only open question is what the codebase needs in order to accept it.

1. **Read what Renovate already told you.** Renovate's PR `body` (recorded in Phase 1) contains the update's old and new versions, links to the upstream release notes and changelog, and — for a major bump — its own breaking-change callout. Read it before anything else; it usually names the exact breaking change the failing test is hitting.

   The PR's `renovate:<updateType>` label (`renovate:major`, `renovate:minor`, `renovate:patch`, `renovate:pin`, `renovate:digest`, `renovate:rollback` — applied by `renovate.json5`'s labelling rule) tells you at a glance which class of update this is, and therefore how much scrutiny it deserves.

2. **Determine why it is stuck.** Read `statusCheckRollup` from Phase 1. Each entry has `name`, `status`, `conclusion`, and `detailsUrl`. There are two distinct cases, and they lead to different places:
   - **Some check's `conclusion` is not `SUCCESS`** — CI is failing. Go to step 3.
   - **Every check is `SUCCESS`** — CI is green and nothing is broken; the PR simply is not eligible for automerge. `renovate.json5` automerges only `matchManagers: ['npm']` + `matchUpdateTypes: ['patch']`, so a green minor bump, a green major bump, and any Docker-tag update all sit here by design, waiting for a human. Skip step 3, do a light version of step 4 (enough to say what the update touches), and expect the **No code changes needed** outcome in step 6.

   `pnpm build` failing locally in Phase 1 step 5 counts as evidence alongside CI, not instead of it — it is often the same failure, seen sooner.

3. **Pull the failing job's logs.** Existing `gh` commands cover this completely; no repo tooling is needed. List the checks and their state:
   ```bash
   gh pr checks <PR>
   ```
   Then take the failing check's `detailsUrl` from `statusCheckRollup` — it has the form `https://github.com/<owner>/<repo>/actions/runs/<run-id>/job/<job-id>` — and read only the failing steps of that run:
   ```bash
   gh run view <run-id> --log-failed
   ```
   `<run-id>` is the number after `/runs/` in that URL. This repo's CI (`.github/workflows/ci.yml`) runs `lint`, `typecheck`, `test`, and `docker-build` as separate jobs behind a `gatekeeper` job, so the failing job's *name* already narrows what broke before you read a single log line. Ignore a `gatekeeper` failure on its own — it only aggregates the other three.

   If the logs are inconclusive, reproduce locally in the worktree — the dependency is already installed there by Phase 1:
   ```bash
   pnpm verify
   ```

4. **Read how the codebase uses the dependency.** Grep for the package's imports and for the specific APIs the changelog flags as changed — the point is to judge the *size* of the fix, not to start making it:
   ```bash
   grep -rn "<package-name>" --include=package.json --exclude-dir=node_modules .
   ```
   ```bash
   grep -rn "from '<package-name>" --include="*.ts" --exclude-dir=node_modules apps packages tools
   ```
   For a transitive dependency (Renovate titles these `update dependency <parent>><child>`, e.g. `@discordjs/rest>undici`) there will usually be **no direct import at all** — the update reaches this repo only through its parent package, and the fix, if any, is a change to how the parent is used or a bump of the parent itself.

   A large repo-wide sweep is better delegated: dispatch a read-only `Explore` agent scoped to the affected package(s), per `develop-feature`'s "Subagent dispatch discipline" (every shell command in the dispatch prompt prefixed with `cd <worktree-path> &&`).

5. **Write the investigation summary.** Save it to `docs/plans/<YYYY-MM-DD>-renovate-pr-<PR>-investigation.md` — e.g. `docs/plans/2026-08-23-renovate-pr-544-investigation.md`. Cover four things: what the update changes (old → new version, and the breaking change if any), why the PR is stuck, what fix is planned (or that none is needed), and which files it will touch.

   **Do not use the Write tool for this** — in a worktree `docs/plans` is a symlink to the main checkout, and the Write tool refuses to write through it. Use the `write-file` subcommand, exactly as `develop-feature`'s Phases 2 and 3 do:
   ```bash
   cd <worktree-path> && node tools/ai-helpers/dist/main.js write-file docs/plans/<summary-filename>.md <<'SUMMARYEOF'
   ...full summary markdown...
   SUMMARYEOF
   ```
   It prints `{"written": "...", "bytes": N}`. If `dist/main.js` is missing, build it with `pnpm --filter @blood-bowl-tracker/ai-helpers run build`; if the heredoc form is refused in this session, write the content to a plain file first and pipe it in (`cat <file> | node tools/ai-helpers/dist/main.js write-file <path>`). Then confirm the save actually landed:
   ```bash
   test -s "<worktree-path>/docs/plans/<summary-filename>.md"
   ```

   This summary is a working note — context for Phase 3 and a record for the developer. It is **not** an approval gate: unlike `develop-feature`'s spec, nothing pauses on it.

6. **Branch on what was found.**

   - **No code changes needed** — CI is green and the PR is only awaiting manual review (the common case for a minor or major bump), or the failure turns out to be unrelated or flaky and a re-run would clear it. Confirm the checks are currently green:
     ```bash
     gh pr checks <PR>
     ```
     Then report that PR #<PR> is ready for human review as-is, summarising what the update changes and what you checked, and **stop**. Skip Phase 3 and Phase 4 entirely — with no new commits there is no diff for self-review to read and nothing new for the review loop's bot to review, so running either would only add noise to Renovate's PR. Say plainly in the report that nothing was pushed.
   - **Mechanical fix found** — the change is a renamed API, a moved import, a changed option name, a type-only adjustment, an updated test expectation, or a matching bump of a sibling package. Continue to Phase 3.
   - **Fix is not mechanical** — it needs a substantial refactor or a product/architecture judgment call. **Pause** (mirroring `code-hygiene`'s Node-task escalation): report what the update breaks, what a fix would involve, and what is already known, then ask the developer via `AskUserQuestion` (single-select, three genuine options — per `CLAUDE.md`'s convention, do not add a free-text or chat option, and do not invent a fourth):
     - **Proceed anyway** — continue to Phase 3 despite the larger scope.
     - **Leave the PR as-is** — stop here. Nothing is pushed; the PR stays open with its findings reported.
     - **Hand off to develop-feature** — stop here, and file a follow-up issue describing the migration work so it can be picked up as a normal `/develop-feature` cycle.
