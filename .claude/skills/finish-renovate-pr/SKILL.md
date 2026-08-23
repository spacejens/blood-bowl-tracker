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

2. **Claim it.** Before claiming, note from the `labels`/`assignees` recorded in step 1 whether `in progress` and `@me` were **already** present — the cleanup steps in Phase 2 step 6 remove only whichever of these this run itself added, so this run must know which that is:
   ```bash
   gh pr edit <PR> --add-assignee @me
   gh pr edit <PR> --add-label "in progress"
   ```
   Run these as two separate commands so a failure in one does not mask the other. Either failure is a one-line warning and the run **continues** — matching `develop-feature`'s assign/label failure tolerance. Do not add a kind label (`feature`/`bug`/`development`): a Renovate PR already carries its own `renovate:<updateType>` label, and this skill opens no PR that would need one.

3. **Create a worktree on Renovate's existing branch, then enter it.** This is a deliberate departure from `develop-feature`'s Setup phase, which uses `superpowers:using-git-worktrees`' native `EnterWorktree` tool in its `name` mode — that mode only ever creates a *new* branch off the default branch, and this skill needs the worktree checked out on `headRefName` itself, because fixes must land on that exact branch to update the existing PR. So this skill does the `git worktree add` step itself first, using the plain git-worktree fallback path (`superpowers:using-git-worktrees` Step 1b):
   ```bash
   git fetch origin <headRefName>
   ```
   ```bash
   git worktree add --track -b <headRefName> .claude/worktrees/<worktree-dir> origin/<headRefName>
   ```
   `<worktree-dir>` is `headRefName` with every `/` replaced by `-` (e.g. branch `renovate/discordjs-rest-undici-8.x` → directory `.claude/worktrees/renovate-discordjs-rest-undici-8.x`) — a directory name cannot contain the slash, but the **branch name is never renamed or sanitized**. `develop-feature`'s mandatory `git branch -m worktree-<name> <name>` rename step has no counterpart here and must not be performed: the branch must stay byte-for-byte what Renovate created.

   If `headRefName` already exists as a local branch (a prior run of this skill on the same PR left the branch behind after its worktree was removed), `-b` fails with `fatal: a branch named '<headRefName>' already exists`. When that happens, do **not** blindly force-reset it — a prior run's Phase 3 may have committed a fix that a later step (e.g. a failed push) never got onto `origin`, and force-resetting would make those commits unreachable. Instead compare the local branch to `origin/<headRefName>` first:
   ```bash
   git fetch origin <headRefName>
   ```
   ```bash
   git merge-base --is-ancestor <headRefName> origin/<headRefName> && echo LOCAL_NOT_AHEAD || echo LOCAL_AHEAD_OR_DIVERGED
   ```
   - **`LOCAL_NOT_AHEAD`** — every commit on the local branch is already on `origin` (the common case: the prior run pushed cleanly, or made no commits at all). Safe to bring it back in line: `git branch -f <headRefName> origin/<headRefName>`, then `git worktree add .claude/worktrees/<worktree-dir> <headRefName>`.
   - **`LOCAL_AHEAD_OR_DIVERGED`** — the local branch has commits `origin` doesn't. **Stop** and ask the developer via `AskUserQuestion` (single-select, two genuine options) how to proceed: **Discard the local commits** (proceed with the `LOCAL_NOT_AHEAD` steps above, force-resetting to `origin/<headRefName>`), or **Investigate manually** (stop the skill entirely — the developer inspects `git log <headRefName> ^origin/<headRefName>` themselves before deciding).

   The full path just created, `.claude/worktrees/<worktree-dir>`, is what every later step means by `<worktree-path>`. Plain `git worktree add` does **not** move the session's cwd — it only creates the directory. So immediately call `EnterWorktree` in its `path` mode to enter the worktree that was just created:
   ```
   EnterWorktree(path: ".claude/worktrees/<worktree-dir>")
   ```
   `EnterWorktree`'s `path` parameter is documented as built for exactly this case — entering a worktree already created with plain `git worktree add` — and, unlike plain `git worktree add`, it actually moves the session's cwd into the worktree. **From this point on, every step in this skill runs from inside the worktree** — no further `cd <worktree-path> &&` prefixing is needed on top-level shell commands. (This is unrelated to the "Subagent dispatch discipline" convention referenced above: a dispatched subagent's shell session is separate from the controller's and still needs its own `cd <worktree-path> &&` prefix on every command in its dispatch prompt.)

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

2. **Determine why it is stuck.** Read `statusCheckRollup` from Phase 1. Each entry has `name`, `status`, `conclusion`, and `detailsUrl`. There are three distinct cases, and they lead to different places:
   - **Some check's `conclusion` is an actual failure** (`FAILURE`, `TIMED_OUT`, `CANCELLED`, `ACTION_REQUIRED`, or any other conclusion that is not `SUCCESS`, `SKIPPED`, or `NEUTRAL`) — CI is failing. Treat the classification as a catch-all rather than an enumerated list: GitHub also reports `STALE` and `STARTUP_FAILURE`, and any future conclusion value not on the known-safe list belongs here too. Go to step 3.
   - **Some check is still queued or running** (`status` is not yet `COMPLETED`, so `conclusion` is `null`) — CI has not finished yet, it has not failed. Poll with `gh pr checks <PR> --watch`, which blocks until every check reaches a final state, or re-check with plain `gh pr checks <PR>` at most a handful of times with a short pause between. If checks are still not final after a reasonable wait, stop waiting: report PR #<PR>'s current check status to the developer and do not guess further, rather than polling indefinitely. Once every check has a final conclusion, re-evaluate this step.
   - **Every check is `SUCCESS`** (a `SKIPPED` or `NEUTRAL` conclusion counts as non-blocking here too) — CI is green and nothing is broken; the PR simply is not eligible for automerge. `renovate.json5` automerges only `matchManagers: ['npm']` + `matchUpdateTypes: ['patch']`, so a green minor bump, a green major bump, and any Docker-tag update all sit here by design, waiting for a human. Skip step 3, do a light version of step 4 (enough to say what the update touches), and expect the **No code changes needed** outcome in step 6.

   `pnpm build` failing locally in Phase 1 step 5 counts as evidence alongside CI, not instead of it — it is often the same failure, seen sooner.

3. **Pull the failing job's logs.** Existing `gh` commands cover this completely; no repo tooling is needed. List the checks and their state:
   ```bash
   gh pr checks <PR>
   ```
   Then take the failing check's `detailsUrl` from `statusCheckRollup` — it has the form `https://github.com/<owner>/<repo>/actions/runs/<run-id>/job/<job-id>` — and read only the failing steps of that run:
   ```bash
   gh run view <run-id> --log-failed
   ```
   `<run-id>` is the number after `/runs/` in that URL. This repo's CI (`.github/workflows/ci.yml`) runs `lint`, `typecheck`, `test`, `docker-build`, and `schemaspy-build` as separate jobs behind a `gatekeeper` job, so the failing job's *name* already narrows what broke before you read a single log line. Ignore a `gatekeeper` failure on its own — it only aggregates the other five.

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

5. **Write the investigation summary.** `<summary-filename>` is `<YYYY-MM-DD>-renovate-pr-<PR>-investigation` (no extension) — e.g. `2026-08-23-renovate-pr-544-investigation`. Save it to `docs/plans/<summary-filename>.md`. Cover four things: what the update changes (old → new version, and the breaking change if any), why the PR is stuck, what fix is planned (or that none is needed), and which files it will touch.

   **Do not use the Write tool for this** — in a worktree `docs/plans` is a symlink to the main checkout, and the Write tool refuses to write through it. Use the `write-file` subcommand, exactly as `develop-feature`'s Phases 2 and 3 do:
   ```bash
   node tools/ai-helpers/dist/main.js write-file docs/plans/<summary-filename>.md <<'SUMMARYEOF'
   ...full summary markdown...
   SUMMARYEOF
   ```
   It prints `{"written": "...", "bytes": N}`. If `dist/main.js` is missing, build it with `pnpm --filter @blood-bowl-tracker/ai-helpers run build`; if the heredoc form is refused in this session, write the content to a plain file first and pipe it in (`cat <file> | node tools/ai-helpers/dist/main.js write-file <path>`). Then confirm the save actually landed:
   ```bash
   test -s "docs/plans/<summary-filename>.md"
   ```

   This summary is a working note — context for Phase 3 and a record for the developer. It is **not** an approval gate: unlike `develop-feature`'s spec, nothing pauses on it.

6. **Branch on what was found.**

   - **No code changes needed** — CI is green and the PR is only awaiting manual review (the common case for a minor or major bump), or the failure turns out to be unrelated or flaky and a re-run would clear it. Confirm the checks are currently green:
     ```bash
     gh pr checks <PR>
     ```
     Then check whether GitHub actually considers the PR mergeable — a green CI run doesn't mean the branch is still mergeable into `main`, and this skill deliberately never syncs `main` into Renovate's branch (see Phase 4's Integration section):
     ```bash
     gh pr view <PR> --json mergeable,mergeStateStatus
     ```
     If `mergeable` is `CONFLICTING`, or `mergeStateStatus` is `DIRTY`/`BEHIND`, report PR #<PR> as **blocked on a stale or conflicting branch** instead of ready — name the reported status, and note that only the developer (or a future run of this skill, if a new commit is needed) can resolve it, since this skill does not merge `main` in on its own. Otherwise (`mergeable: MERGEABLE`, or `UNKNOWN` — GitHub hasn't finished computing it yet, treat that as non-blocking rather than waiting on it) continue as below. In either case, report that PR #<PR> is ready for human review as-is (or blocked, per the check above), summarising what the update changes and what you checked, and **stop**. Skip Phase 3 and Phase 4 entirely — with no new commits there is no diff for self-review to read and nothing new for the review loop's bot to review, so running either would only add noise to Renovate's PR. Say plainly in the report that nothing was pushed. Since no work is in flight, clean up what Phase 1 claimed: remove the `in progress` label and/or the `@me` assignee **only if this run's Phase 1 step 2 added them** (`gh pr edit <PR> --remove-label "in progress"` and/or `gh pr edit <PR> --remove-assignee @me`, whichever this run added — leave alone whichever was already present before this run started) and remove the now-unneeded worktree — use the `wrap-up` skill, or do it manually in two steps: first `ExitWorktree(action: "keep")` to return the session to the main checkout (this skill's steps normally run from inside the worktree per Phase 1 step 3, and `keep` is the only mechanism that can move the session back for a worktree entered via `path` — **do not** use `ExitWorktree(action: "remove")` here, it explicitly refuses to remove a worktree entered this way), then, now back in the main checkout, run `git worktree remove <worktree-path>`.
   - **Mechanical fix found** — the change is a renamed API, a moved import, a changed option name, a type-only adjustment, an updated test expectation, or a matching bump of a sibling package. Continue to Phase 3.
   - **Fix is not mechanical** — it needs a substantial refactor or a product/architecture judgment call. **Pause** (mirroring `code-hygiene`'s Node-task escalation): report what the update breaks, what a fix would involve, and what is already known, then ask the developer via `AskUserQuestion` (single-select, three genuine options — per `CLAUDE.md`'s convention, do not add a free-text or chat option, and do not invent a fourth):
     - **Proceed anyway** — continue to Phase 3 despite the larger scope.
     - **Leave the PR as-is** — stop here. Nothing is pushed; the PR stays open with its findings reported. Since no work is in flight, clean up what Phase 1 claimed: remove the `in progress` label and/or the `@me` assignee **only if this run's Phase 1 step 2 added them** (`gh pr edit <PR> --remove-label "in progress"` and/or `gh pr edit <PR> --remove-assignee @me`, whichever this run added — leave alone whichever was already present before this run started) and remove the now-unneeded worktree — use the `wrap-up` skill, or do it manually in two steps: first `ExitWorktree(action: "keep")` to return the session to the main checkout (this skill's steps normally run from inside the worktree per Phase 1 step 3, and `keep` is the only mechanism that can move the session back for a worktree entered via `path` — **do not** use `ExitWorktree(action: "remove")` here, it explicitly refuses to remove a worktree entered this way), then, now back in the main checkout, run `git worktree remove <worktree-path>`.
     - **Hand off to develop-feature** — stop here, and file a follow-up issue describing the migration work so it can be picked up as a normal `/develop-feature` cycle. Since no work is in flight on this PR, clean up what Phase 1 claimed: remove the `in progress` label and/or the `@me` assignee **only if this run's Phase 1 step 2 added them** (`gh pr edit <PR> --remove-label "in progress"` and/or `gh pr edit <PR> --remove-assignee @me`, whichever this run added — leave alone whichever was already present before this run started) and remove the now-unneeded worktree — use the `wrap-up` skill, or do it manually in two steps: first `ExitWorktree(action: "keep")` to return the session to the main checkout (this skill's steps normally run from inside the worktree per Phase 1 step 3, and `keep` is the only mechanism that can move the session back for a worktree entered via `path` — **do not** use `ExitWorktree(action: "remove")` here, it explicitly refuses to remove a worktree entered this way), then, now back in the main checkout, run `git worktree remove <worktree-path>`.

---

### Phase 3: Development

Runs only when Phase 2 ended in **Mechanical fix found** (or when the developer chose **Proceed anyway** at its escalation).

Follow `develop-feature`'s Phase 4 discipline, with Phase 2's investigation summary standing in for its plan file:

- **Docs first** — if the fix introduces a new concept or constraint (rare for a dependency bump, but a changed runtime requirement or a new config flag qualifies), update the relevant spec under `docs/` per `docs/spec-conventions.md`.
- **Test first** — **REQUIRED SUB-SKILL:** Use `superpowers:test-driven-development`. When the bump broke an existing test, that test *is* the failing test; confirm it fails for the reason the changelog predicts before changing anything, rather than adjusting it to whatever the new version happens to return.
- **Implement** the fix.
- **Debug** — **REQUIRED SUB-SKILL:** Use `superpowers:systematic-debugging` on any unexpected failure.
- **Verify** — **REQUIRED SUB-SKILL:** Use `superpowers:verification-before-completion` before calling the change done.
- **Docs and deployment sync** — if the change makes anything under `docs/` stale, or changes what `Dockerfile`/`docker-compose.yml` need to know, update those now.
- **Commit** one logical change at a time, then run `pnpm verify` from the repo root if that commit's diff touched anything under `apps/`, `packages/`, or `tools/`; if it touched only `.claude/` or `docs/`, skip it and note why — `develop-feature`'s Phase 4 step 5 rule, unchanged. **One addition specific to this skill:** a commit touching the root `package.json`, `pnpm-lock.yaml`, or `pnpm-workspace.yaml` always runs `pnpm verify`, regardless of whether it also touches `apps/`/`packages/`/`tools/` — this skill's most common diff is exactly a root manifest/lockfile change from bumping or re-resolving a dependency, and that is precisely the change most worth verifying.

Typically this is a single commit: "make the code changes this dependency bump needs." **Never amend, rebase, or force-push Renovate's existing commit** — add your own commits on top of it. Rewriting Renovate's commit would force-push the PR's branch and destroy the correspondence between the PR's review history and its diff.

Print a brief status line — what was fixed and whether `pnpm verify` is green (or was skipped and why) — then continue immediately into Phase 4.

---

### Phase 4: Self-review & Integration

#### Self-review

Identical to `develop-feature`'s Phase 5, with no changes:

1. **REQUIRED SUB-SKILL:** Use `superpowers:requesting-code-review`, scoped to the commits made in Phase 3 — Renovate's own manifest/lockfile commit is the input to this work, not part of the diff under review.
2. Fix every Critical and Important finding and re-run `pnpm verify`; repeat until the review is clean (no unresolved Critical or Important findings, all tests passing).
3. Once clean, resolve each remaining Minor finding as exactly one of **Fix**, **Drop**, or **Question**, exactly as `develop-feature`'s Phase 5 step 4 describes — defaulting to Fix, applying all Fixes first, then re-checking each recorded Question's file and line against the post-Fix state. Carry the pending-questions list forward into Integration.

#### Integration

The main departure from `develop-feature`'s Phase 6. **There is no `main`-sync merge step and no `gh pr create`** — the PR already exists, and merging `main` into Renovate's branch would put commits on it that Renovate never made and that the developer did not ask for. Leave the branch exactly as far behind `main` as Renovate left it; GitHub's merge button handles the rest.

1. **Pre-push check — no stray work in the main checkout.** Unchanged from `develop-feature`'s Phase 6 step 2 — it guards against a dropped `cd` prefix regardless of how the branch came to exist:
   ```bash
   node tools/ai-helpers/dist/main.js check-main-stray
   ```
   `{"isWorktree": false}` means work is happening in place — skip the rest of this step. Otherwise triage each entry in `uncommittedFiles` and `strayCommits` exactly as `develop-feature` describes: anything already present on this branch is safe to clean up on the main checkout (resolve its path with `node tools/ai-helpers/dist/main.js resolve-main-root`), and anything whose provenance is unclear is **never** auto-discarded — surface it and ask the developer via `AskUserQuestion`.

2. **Capture the push watermark**, immediately *before* pushing — the review loop below needs it:
   ```bash
   date +%s
   ```
   Record the printed epoch. **This is where this skill differs from `develop-feature`'s first-iteration watermark**, which anchors to the PR's `createdAt`. That anchor is correct there because the PR is brand new; here the PR may be weeks old and already carry CodeRabbit reviews of Renovate's original commit, and using `createdAt` would make the very first wait match one of those stale reviews instantly. Capturing the epoch just before the push is the equivalent "nothing before this counts" line for a pre-existing PR, and capturing it *before* rather than after the push closes the race where a fast bot review lands while `git push` is still returning.

3. **Push onto Renovate's branch.**
   ```bash
   git push origin <headRefName>
   ```
   This updates the existing PR in place. No new PR is created and no PR body is edited — the PR keeps its number, its `renovate:<updateType>` label, its assignee, and its full review history.

   **Tell the developer, once, in the status line for this step:** Renovate treats a branch carrying commits it did not author as manually edited, and stops rebasing or updating it on its own. Renovate's PR body offers a "check this box to rebase/retry" checkbox — **ticking it after this push discards these commits**, because Renovate rebuilds the branch from scratch. The developer should merge the PR rather than ask Renovate to retry it.

4. **Post pending self-review questions, if any.** If the Self-review step's pending-questions list is empty, skip this step entirely and silently — the common case. Otherwise build a JSON array of `{ "file": "<repo-relative path>", "line": <integer>, "body": "<question text>" }` objects (do **not** prepend `**Comment by Claude**` — the subcommand does that itself) and post them with one command:
   ```bash
   node tools/ai-helpers/dist/main.js post-review-questions <PR> <<'QUESTIONSEOF'
   [
     { "file": "path/to/file.ts", "line": 42, "body": "..." }
   ]
   QUESTIONSEOF
   ```
   Report from its printed `posted`/`failed` arrays how many went inline, how many went top-level, and how many failed (naming each failure's file, line, and error). Any failure here is a one-line warning and never a stop — the push already landed regardless.

5. **Automated review loop.** Run `develop-feature`'s Phase 6 step 5 loop unchanged — it already works against any open PR by number, whoever opened it. In short: capture the developer's login once (`gh api user --jq .login`; if it fails, skip the loop with a one-line warning and go to step 6), then repeat for at most **5 iterations**:

   a. Wait for a non-author review with a single backgrounded command:
   ```bash
   node tools/ai-helpers/dist/main.js wait-for-pr-review <PR> <developer-login> <watermark-epoch> --exclude-review-id=<previous-review-id>
   ```
   The **first** iteration's `<watermark-epoch>` is the epoch captured in step 2 above — not the PR's `createdAt` — and omits `--exclude-review-id` entirely (there is nothing to exclude yet). Every later iteration uses the previous iteration's found `review.submittedAt` converted to epoch seconds, and passes that review's `id` as `--exclude-review-id`. Run it with `run_in_background: true` and branch on the JSON it prints at exit; never use `ScheduleWakeup` for this wait.

   b. Handle `{"found": false, ...}` results exactly as `develop-feature`'s Phase 6 steps (b), (b2), and (b3) describe — timeout, CodeRabbit rate-limit, and comment-update-failure respectively, including their retry commands, their watermark-advancement rules, and which of them Pause versus continue automatically. None of that behavior changes here; do not restate or re-derive it, read it there.

   c. **REQUIRED SUB-SKILL:** Use `handle-pr-reviews`, targeting this PR by number and always passing `--skip-deploy-local` (`/handle-pr-reviews <PR> --skip-deploy-local`) — the flag keeps its `deploy-local` hand-off from stalling this unattended loop; step 6 below makes that offer once instead.

   d. Apply `develop-feature`'s exit check unchanged: leave the loop early on "No unhandled review comments or failing CI checks found", on a stop for an ambiguous item, or on a Phase 7 summary reporting that no fix commits were pushed. A "still in progress" report is **not** an exit condition — start the next iteration.

   After the loop, print a brief status line naming how it ended, then continue.

6. **Offer a local look.** **REQUIRED SUB-SKILL:** Use the `deploy-local` skill, exactly as `develop-feature`'s Phase 6 step 6 does — this is the only `deploy-local` offer this skill produces, since step 5c suppresses `handle-pr-reviews`' own. It is worth making even for a dependency bump: an updated runtime library can break at startup in ways no unit test covers. Do not ask the developer separately before invoking it — `deploy-local` asks which of its actions to run.

7. **Skill ends.** Human review and merge happen outside this workflow, same as `develop-feature`. Renovate's PR is now updated in place, has been through both Claude's self-review and an independent bot pass, and is ready for the developer to merge. Once it has merged, use the `wrap-up` skill to verify the merge and clean up the worktree and branch.

---

## Out of scope

- **Batch-processing or triaging several stuck Renovate PRs in one run.** One PR per invocation, chosen by the developer. Run the skill again for the next one.
- **Any change to `renovate.json5`.** Its automerge rules, grouping, labelling, and disabled packages are deliberate decisions the developer makes directly — a skill run reacting to one awkward PR is the worst possible vantage point from which to retune them.
- **Node version and `@types/node` updates.** `renovate.json5` disables Renovate for both; they belong to `code-hygiene`'s Node version task, which moves them in lock-step with every Dockerfile `FROM node:...` line.
