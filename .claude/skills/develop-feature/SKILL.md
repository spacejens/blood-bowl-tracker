---
name: develop-feature
description: Use when starting work on a GitHub issue or an ad-hoc feature in the blood-bowl-tracker project — takes an issue number or a text description and guides development from branch creation to a pull request ready for human review
---

# develop-feature

Structured feature development from a GitHub issue or free-form description to a pull request. See [docs/development-workflow.md](../../../docs/development-workflow.md) for the human-readable explanation of this process.

## Invocation

**Issue mode** — provide a GitHub issue number:
```
/develop-feature 42
```

**Ad-hoc mode** — provide a text description of the feature:
```
/develop-feature Add player stats endpoint
```

If the argument is a plain integer, issue mode is used. Any other text triggers ad-hoc mode.

## Phases

Work through each phase in order. Some phase transitions require the developer's explicit approval before continuing — these are marked **Pause** in the phase below, and you must wait for confirmation before proceeding. Other transitions carry no actionable decision for the developer (e.g., confirming a worktree was created, or that automated checks passed) — for these, print a brief status line noting what completed, then continue immediately into the next phase without waiting.

## Subagent dispatch discipline

This applies to every subagent dispatched from any phase below while working in a worktree — the planning subagent in Phase 3, implementer, task reviewer, and fixer subagents in Phase 4, and the self-review subagent in Phase 5. Every shell command in its dispatch prompt must be prefixed with `cd <worktree-path> &&` — do not rely on a one-time "work from `<path>`" instruction. Subagent shell sessions do not reliably persist a starting directory across tool calls, and a dropped `cd` can silently commit to the wrong checkout (e.g. `main` in the primary repo instead of the feature branch). After each subagent reports a commit, verify with `git log --oneline -1` and `git branch --show-current` (run from the worktree) that the commit actually landed on the expected branch before trusting the report.

---

### Phase 1: Setup

**Detect mode** from the argument:
- No argument → ask the developer to provide an issue number or feature description, then restart Phase 1
- Plain integer (e.g. `42`) → **issue mode**
- Any other text (e.g. `Add player stats endpoint`) → **ad-hoc mode**

**Issue mode:**
1. Fetch the issue:
   ```bash
   gh issue view <N> --json title,body,labels,state,assignees,url,comments
   ```
   If the issue does not exist, `gh` will error — report the error and **stop**.
2. Surface any existing comments so prior investigation notes (e.g. "blocked on issue #X, see findings below") are read before Phase 1 makes any decision. Using the `comments` array from the step 1 fetch:
   - If it is non-empty, print each comment's author and body — one line per comment, e.g. `Existing comments on #N: — @<author>: <body>`.
   - If it is empty, skip silently — print nothing and change no behavior.
   This is informational only: it never gates, pauses, or alters the PR-check / state-check / claim / branch flow that follows.
3. Check whether `<N>` is actually a pull request, not an issue: if the returned `url` contains `/pull/` (issue URLs are `.../issues/<N>`; PR URLs are `.../pull/<N>`), report "Issue #N is a pull request, not an issue. Nothing to do." and **stop** — do not proceed to the state check, assignment, branch naming, or worktree creation.
4. Check the `state` field. If it is not `OPEN`, report "Issue #N is not open (state: `<state>`). Nothing to do." and **stop**.
5. Claim the issue:
   - Determine the current `gh` user:
     ```bash
     gh api user --jq .login
     ```
     If this command fails, report a one-line warning and **continue** — skip the assign/label step but still determine and record the kind label below (it does not depend on the current user), then proceed to step 6 to derive the branch name.
   - If the issue's `assignees` array is non-empty and does not include the current user's login, report "Issue #N is already assigned to `<assignee login(s)>`. Stopping." and **stop** — do not derive a branch name or create a worktree.
   - Otherwise (unassigned, or already assigned to the current user), assign and label it:
     ```bash
     gh issue edit <N> --add-assignee @me
     gh issue edit <N> --add-label "in progress"
     ```
     Run these as two separate commands so a failure in one doesn't mask the other. If either command fails, report a one-line warning (e.g. "Could not assign issue #N to you — continuing anyway: `<gh error output>`") and **continue** — do not stop the workflow over a labeling/assignment failure.
   - Determine the issue's kind label — one or more of `feature`, `bug`, `development`:
     - If the issue's `labels` (from the step 1 fetch) already includes one or more of these three, use that set as-is and skip straight to recording it below.
     - Otherwise, judge from the issue's title and body which of the three clearly apply. More than one may apply (e.g. a bug fix that's also process tooling) — assign all that clearly do.
     - If it's genuinely unclear which applies, ask the developer to choose via `AskUserQuestion`, offering `feature`, `bug`, and `development` as multi-select options.
     - Apply any newly-determined label(s) with one `gh issue edit <N> --add-label "<name>"` call per label (separate from the "in progress" call above, so a failure in one doesn't mask the other). On failure, report a one-line warning and **continue**, matching the existing assign/label failure handling.
   - Record the final kind-label set (whether reused from the existing labels or newly applied) — Phase 6 reuses it when creating the PR.
6. **Pause** — derive **two** distinct candidate branch names of the form `issue-{N}-{kebab-slug}` from the issue title (lowercase, spaces → hyphens, punctuation stripped) and ask the developer to choose one via `AskUserQuestion` (single-select, one question, two options). Wait for the answer before proceeding; the chosen — or free-text — name is the confirmed branch name used in step 7.
   - **Option 1** — a full slug that closely follows the issue title.
   - **Option 2** — a shortened or rephrased variant of that same slug.
   - If both heuristics would produce the identical string, vary option 2 further (shorten or rephrase again) so the two options are always genuinely distinct. Never collapse to a single option — `AskUserQuestion` requires at least two.
   - Per this project's `AskUserQuestion` convention (`CLAUDE.md`), do not add an explicit free-text or chat option — both are provided automatically.
   - If the developer supplies a free-text name instead of choosing one of the two options, normalize it to the same form (lowercase kebab-case, punctuation stripped) and prepend the `issue-{N}-` prefix if missing, before treating it as the confirmed branch name.
   - Example: issue 42 "Add player stats endpoint" → offer `issue-42-add-player-stats-endpoint` and `issue-42-player-stats-endpoint`
7. **REQUIRED SUB-SKILL:** Use `superpowers:using-git-worktrees` to create an isolated worktree on the confirmed branch name. The `EnterWorktree` tool always names the new branch `worktree-<confirmed-name>` (it forces a `worktree-` prefix). As a **mandatory** follow-up — always executed, never skipped — immediately rename that branch to the confirmed name:
   ```bash
   git branch -m worktree-<confirmed-name> <confirmed-name>
   ```
   `<confirmed-name>` is the branch name confirmed with the developer in step 6 (e.g. `issue-66-development-process-improvements`). After renaming, verify the branch is now `<confirmed-name>` with no `worktree-` prefix (`git branch --show-current`) before continuing.
8. **Link the plans directory** so specs and plans from Phase 2–3 are saved outside the worktree and survive its removal:
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
   If no worktree was created (the developer declined worktree creation in Step 0 of `using-git-worktrees`), `MAIN_ROOT` already equals the current directory and this step is a no-op.
9. Install dependencies and build the whole application so later tasks don't fail due to an unbuilt workspace dependency, and so `tools/ai-helpers` (which step 10 invokes) exists as compiled output. `superpowers:using-git-worktrees`'s own generic project-setup step runs plain `npm install`, which is wrong for this pnpm workspace — always (re-)install with pnpm here rather than relying on that step:
   ```bash
   pnpm install
   pnpm build
   ```
   If either command fails, report the failure and stop — do not proceed into Phase 2 with a broken baseline.
10. **Sync gitignored worktree files** so later phases can touch BBL/TP data and config-dependent tooling without hitting "file not found" — a fresh worktree lacks the gitignored config files and data directories the main checkout has. Run:
   ```bash
   node tools/ai-helpers/dist/main.js sync-gitignored
   ```
   The canonical file and directory lists live in `tools/ai-helpers/src/shared/gitignored-files.ts` — add a new tool's config there, not here. The command only fills in what is missing; it never overwrites a file or symlink already present (a developer may have deliberately set one up differently), and it is a no-op outside a worktree. The large `tools/import-bbl/data` and `tools/import-tp/data` directories are symlinked rather than copied — same rationale as the `docs/plans` link in step 8. `tools/review-match` needs no `data/` symlink of its own — its config points at `tools/import-bbl/data` and `tools/import-tp/data`. `deploy-local` runs the same command as a fallback for worktrees this skill did not create; because it is idempotent, that later pass is a no-op when this one already ran.

   It prints JSON to stdout, e.g.:
   ```json
   {
     "copied": ["apps/discord-bot/.env"],
     "symlinked": ["tools/import-bbl/data"],
     "skipped": ["tools/review-match/review-match-config.json5"]
   }
   ```
   `skipped` covers both "already present in the worktree" and "absent from the main checkout too" — neither is an error, so report the counts in step 11's status line and continue. If the command exits non-zero it prints `{"error": "<message>"}` on stderr; report that and stop.
11. Print a brief status line confirming the worktree path, build result, and baseline test result, then continue immediately into Phase 2.

**Ad-hoc mode:**
1. Use the provided text as the feature description
2. Determine the kind label — one or more of `feature`, `bug`, `development` — by judging from the provided text which clearly apply. More than one may apply; assign all that clearly do. If it's genuinely unclear, ask the developer to choose via `AskUserQuestion`, offering `feature`, `bug`, and `development` as multi-select options. Record the result — Phase 6 uses it when creating the PR. Nothing is applied to GitHub yet, since there is no issue or PR to attach a label to until Phase 6.
3. **Pause** — derive **two** distinct candidate branch names of the form `feature-{kebab-slug}` from the provided text (lowercase, spaces → hyphens, punctuation stripped) and ask the developer to choose one via `AskUserQuestion` (single-select, one question, two options). Wait for the answer before proceeding; the chosen — or free-text — name is the confirmed branch name used in step 4.
   - **Option 1** — a full slug that closely follows the provided description.
   - **Option 2** — a shortened or rephrased variant of that same slug.
   - If both heuristics would produce the identical string, vary option 2 further (shorten or rephrase again) so the two options are always genuinely distinct. Never collapse to a single option — `AskUserQuestion` requires at least two.
   - Per this project's `AskUserQuestion` convention (`CLAUDE.md`), do not add an explicit free-text or chat option — both are provided automatically.
   - If the developer supplies a free-text name instead of choosing one of the two options, normalize it to the same form (lowercase kebab-case, punctuation stripped) and prepend the `feature-` prefix if missing, before treating it as the confirmed branch name.
   - Example: "Add player stats endpoint" → offer `feature-add-player-stats-endpoint` and `feature-player-stats-endpoint`
4. **REQUIRED SUB-SKILL:** Use `superpowers:using-git-worktrees` to create an isolated worktree on the confirmed branch name. The `EnterWorktree` tool always names the new branch `worktree-<confirmed-name>` (it forces a `worktree-` prefix). As a **mandatory** follow-up — always executed, never skipped — immediately rename that branch to the confirmed name:
   ```bash
   git branch -m worktree-<confirmed-name> <confirmed-name>
   ```
   `<confirmed-name>` is the branch name confirmed with the developer in step 3 (e.g. `feature-add-player-stats-endpoint`). After renaming, verify the branch is now `<confirmed-name>` with no `worktree-` prefix (`git branch --show-current`) before continuing.
5. **Link the plans directory** so specs and plans from Phase 2–3 are saved outside the worktree and survive its removal:
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
   If no worktree was created (the developer declined worktree creation in Step 0 of `using-git-worktrees`), `MAIN_ROOT` already equals the current directory and this step is a no-op.
6. Install dependencies and build the whole application so later tasks don't fail due to an unbuilt workspace dependency, and so `tools/ai-helpers` (which step 7 invokes) exists as compiled output. `superpowers:using-git-worktrees`'s own generic project-setup step runs plain `npm install`, which is wrong for this pnpm workspace — always (re-)install with pnpm here rather than relying on that step:
   ```bash
   pnpm install
   pnpm build
   ```
   If either command fails, report the failure and stop — do not proceed into Phase 2 with a broken baseline.
7. **Sync gitignored worktree files** so later phases can touch BBL/TP data and config-dependent tooling without hitting "file not found" — a fresh worktree lacks the gitignored config files and data directories the main checkout has. Run:
   ```bash
   node tools/ai-helpers/dist/main.js sync-gitignored
   ```
   The canonical file and directory lists live in `tools/ai-helpers/src/shared/gitignored-files.ts` — add a new tool's config there, not here. The command only fills in what is missing; it never overwrites a file or symlink already present (a developer may have deliberately set one up differently), and it is a no-op outside a worktree. The large `tools/import-bbl/data` and `tools/import-tp/data` directories are symlinked rather than copied — same rationale as the `docs/plans` link in step 5. `tools/review-match` needs no `data/` symlink of its own — its config points at `tools/import-bbl/data` and `tools/import-tp/data`. `deploy-local` runs the same command as a fallback for worktrees this skill did not create; because it is idempotent, that later pass is a no-op when this one already ran.

   It prints JSON to stdout, e.g.:
   ```json
   {
     "copied": ["apps/discord-bot/.env"],
     "symlinked": ["tools/import-bbl/data"],
     "skipped": ["tools/review-match/review-match-config.json5"]
   }
   ```
   `skipped` covers both "already present in the worktree" and "absent from the main checkout too" — neither is an error, so report the counts in step 8's status line and continue. If the command exits non-zero it prints `{"error": "<message>"}` on stderr; report that and stop.
8. Print a brief status line confirming the worktree path, build result, and baseline test result, then continue immediately into Phase 2.

---

### Phase 2: Specification

1. **Cross-tool/app impact review.** A change rarely stops at the tool or app the issue names: a downloader change alters what its importer can import, a change to one importer usually wants a matching change in its sibling, and newly imported data is something a consuming app or tool could surface. Run this before brainstorming, so the answers are context the spec starts from rather than something it has to rediscover.
   - Identify which tool(s)/app(s) the issue (issue mode) or provided text (ad-hoc mode) names or clearly involves.
   - Look each one up in the "Tool/app relationships" section of `docs/architecture.md`. If none of them appear there, or the ones that do name no related tools/apps worth investigating for this change, **skip the rest of this step silently** — no prompt, no status line, no mention in the spec.
   - For each related tool/app found, dispatch a read-only `Explore` agent scoped to that one tool/app — not the whole repo — to report concrete specifics relevant to this issue: what it does today, what data it already has, and what is missing relative to what this issue would change. Per the "Subagent dispatch discipline" section above, prefix every shell command in its dispatch prompt with `cd <worktree-path> &&`.
   - Turn those findings into specific questions and ask them via `AskUserQuestion` — e.g. "The same match results are also available in TP data. Import them there too?" or "How should the new match results be shown in review-match?". Ask only about findings that genuinely warrant a decision; drop a finding that turns out to be a non-issue (the sibling importer already behaves the same way) rather than manufacturing a question for every related tool/app found. A question that cannot name the specific tool and the specific behavior is not ready to be asked — never fall back to a generic "should this be broader in scope?". Per this project's `AskUserQuestion` convention (`CLAUDE.md`), do not add an explicit free-text or chat option — both are provided automatically.
   - Carry the answers into step 2 as part of the starting context.
2. **REQUIRED SUB-SKILL:** Use `superpowers:brainstorming` with the issue content (issue mode) or provided text (ad-hoc mode) — plus any answers from step 1 — as starting context
3. **Override the brainstorming skill's default spec save location:** save the spec to `docs/plans/` (gitignored), not `docs/superpowers/specs/`. Note the exact saved filename — Phase 3 needs it.
4. **Pause** — ask the developer to review the written spec via `AskUserQuestion`, offering two genuine options: "Approve, move to planning" (proceed to Phase 3) and "Revise the spec" (return to `superpowers:brainstorming` to make changes, then ask again). Per this project's `AskUserQuestion` convention (`CLAUDE.md`), do not add an explicit free-text or chat option — both are provided automatically.

---

### Phase 3: Planning

1. Dispatch a foreground `Agent` call (`model: "opus"`, `run_in_background: false` — Phase 4 depends on its output) to run `superpowers:writing-plans` against the approved spec. Every shell command in its dispatch prompt must be prefixed with `cd <worktree-path> &&`, per the "Subagent dispatch discipline" section above. The dispatch prompt must tell the agent to:
   - Read the approved spec at `docs/plans/<spec-filename>.md` (pass the exact filename from Phase 2)
   - Follow `superpowers:writing-plans`, saving the plan to `docs/plans/` (gitignored) instead of that skill's own default location
   - Skip its "Execution Handoff" question — this workflow always uses `subagent-driven-development` (see Phase 4) — and report back only the saved plan's filename
   Planning is delegated to Opus (rather than Phase 2's brainstorming, which stays inline) because it's a bounded, non-interactive task — turning an already-approved spec into a plan file — while brainstorming needs live back-and-forth with the developer that a dispatched subagent handles poorly. This targets the extra reasoning power at one focused step without spending it on the token-heavy implementation phase.
2. After the agent reports its saved plan filename, verify the file exists at that path in the worktree before continuing (`test -f "<worktree-path>/docs/plans/<filename>.md"`) — do not trust the report alone. A `git status` check would not work here: `docs/plans` is gitignored and symlinked to the main checkout, so git reports nothing for it either way.
3. Print a brief status line confirming the plan is written and saved, then continue immediately into Phase 4. The plan is too detailed for a human to usefully approve line-by-line, and the spec approved at the end of Phase 2 already covers the requirements decision — the PR opened in Phase 6 is the review point for the resulting implementation.

---

### Phase 4: Development

1. **REQUIRED SUB-SKILL:** Use `superpowers:subagent-driven-development` to execute the plan. This is the only execution approach used in this workflow — do not ask the developer to choose between this and any alternative (e.g. `executing-plans`); proceed directly into subagent-driven-development. **Stop short of that skill's own terminal steps**: once all tasks are marked complete in its process, do not run its final whole-branch code review, and do not hand off to `superpowers:finishing-a-development-branch`. Both are superseded by this workflow's own Phase 5 (self-review) and Phase 6 (PR creation) — running them here would review the same diff twice and present a merge/PR/keep/discard menu that conflicts with Phase 6's PR creation.
2. For **each task** in the plan, follow this order:
   - **Docs first:** If the task introduces a new concept or constraint, update or create the relevant spec under `docs/` following `docs/spec-conventions.md`
   - **Test first:** Write the failing test — **REQUIRED SUB-SKILL:** Use `superpowers:test-driven-development`. Cover the new branches and edge cases the task introduces (error paths, not-found/empty results, boundary values), not just the happy path — every package enforces a 90% coverage threshold as part of `pnpm test`/`pnpm verify`, so a happy-path-only test now means a second round of test-writing later just to clear the gate.
   - **Implement:** Write code until tests pass
   - **Docs and deployment sync:** If the change just implemented makes any existing file under `docs/` stale (a renamed field, changed behavior, a new module worth mentioning), update it now, without waiting to be asked — keep the update brief, per `docs/spec-conventions.md`. Likewise, if the change affects what `Dockerfile` or `docker-compose.yml` need to know (a new workspace package required at runtime, a changed port or env var, a new migrations path), update those files too.
   - **Commit:** One commit per completed task; message explains what changed and why
3. If tests fail unexpectedly: **REQUIRED SUB-SKILL:** Use `superpowers:systematic-debugging` before proposing fixes
4. Before marking each task done: **REQUIRED SUB-SKILL:** Use `superpowers:verification-before-completion`
5. After each task: check whether the task's diff touches any file under `apps/`, `packages/`, or `tools/` (`git diff --name-only <task-base-sha>..HEAD`, where `<task-base-sha>` is the commit recorded before dispatching that task's implementer). If it does, run `pnpm verify` from the repo root to confirm no regressions (build, lint, typecheck, test) — when lint or formatting checks fail, run `pnpm lint:fix` and/or `pnpm format:fix` first; only hand-edit failures those commands can't auto-resolve. If the diff touches only files outside those three directories (e.g. `.claude/`, `docs/`), skip `pnpm verify` and note in the task's status line that it was skipped and why — none of `pnpm verify`'s scripts (`build`, `lint`, `typecheck`, `test`) run against paths outside `apps/`, `packages/`, `tools/`, so there is nothing for them to check.
6. Print a brief status line confirming all tasks are complete and that `pnpm verify` is green for every task that ran it (noting any tasks that skipped it per step 5), then continue immediately into Phase 5.

---

### Phase 5: Self-review

1. **REQUIRED SUB-SKILL:** Use `superpowers:requesting-code-review` across all changes on the branch
2. Fix any findings; re-run `pnpm verify` to confirm clean
3. Repeat steps 1–2 until the review is clean and all tests pass
4. **Pause** — ask the developer to confirm via `AskUserQuestion`, offering two genuine options: "Approve, move to PR" (proceed to Phase 6) and "Review further" (re-run `superpowers:requesting-code-review`, then ask again). Per this project's `AskUserQuestion` convention (`CLAUDE.md`), do not add an explicit free-text or chat option — both are provided automatically.

---

### Phase 6: Integration

1. **Sync with `main`.** Bring the branch up to date with `main` before pushing (merge, never rebase — see `CLAUDE.md` "Keeping a branch in sync with main"). This runs once here, right before the push — not per-commit, and not gated on first checking whether `main` moved (merging an up-to-date `main` is a harmless no-op).
   ```bash
   git fetch origin main
   git merge origin/main
   ```
   - **Clean merge** (no conflicts): run `pnpm verify` from the repo root. If it fails, fix the regression the merge introduced, commit, and continue. If it passes, continue directly.
   - **Conflict:** attempt an automated resolution — read both sides of each conflicting hunk, resolve, then run `pnpm verify`. If the correct resolution isn't clear from the diffs, or `pnpm verify` doesn't come back clean afterward, **stop**, report the conflicting files, and wait for the developer to resolve manually before continuing.
2. **Pre-push check — no stray work in the main checkout.** Before `gh pr create` pushes the branch, verify nothing was accidentally left in the **main checkout** (the repo's primary working tree, distinct from this worktree) — the usual cause is a subagent dropping its `cd <worktree>` prefix and editing/committing against `main`.
   ```bash
   node tools/ai-helpers/dist/main.js check-main-stray
   ```
   This prints JSON. If it prints `{"isWorktree": false}`, work is happening in place — **skip the rest of this step**. Otherwise it prints:
   ```json
   {
     "isWorktree": true,
     "uncommittedFiles": [{ "status": " M", "path": "path/to/file" }],
     "strayCommits": [{ "sha": "abc1234", "subject": "commit subject" }]
   }
   ```
   `status` is the raw 2-character `git status --porcelain` code (e.g. `" M"`, `"??"`, `"A "`) — needed below to tell a restorable edit apart from an untracked file. If both arrays are empty, there is nothing stray — continue to step 3. Run this via the CLI rather than `git -C "$MAIN_ROOT" ...` directly: the harness blocks a worktree-isolated session from running git against another checkout, even read-only, so the inline form this replaces could not actually execute here.
   - For each stray item, decide whether it is **already part of this worktree's work**:
     - **Uncommitted edit on main** (an entry in `uncommittedFiles`) — the same content is already committed on the worktree branch (restoring the file on main would lose nothing). Compare the main checkout's working-tree content for the affected paths against the worktree branch's committed content.
     - **Committed on main** (an entry in `strayCommits`) — the commit's patch is already present on the worktree branch (cherry-pick-equivalent — `git cherry` / patch-id match, or the identical diff already committed here).
   - Act on each item. Cleanup runs against the main checkout, so first resolve its path:
     ```bash
     node tools/ai-helpers/dist/main.js resolve-main-root
     ```
     and use the printed `mainRoot` value as `<main-root>` below.
     - **Already in the worktree** → safe to clean up on main automatically. For an `uncommittedFiles` entry whose `status` starts with `?` (untracked — `git restore`/`checkout --` is a no-op on these), delete it directly: `rm "<main-root>/<path>"`. For every other status code, use `git -C "<main-root>" restore <paths>` (or `git -C "<main-root>" checkout -- <paths>`); reset the redundant stray commits the same way. Report what was cleaned. If the `git -C "<main-root>" ...` command itself is refused by the harness (worktree isolation), do not silently skip cleanup — print the exact command to the developer and ask them to run it themselves, e.g. by typing `! <command>` in their prompt (which runs it in their own session and returns its output into the conversation).
     - **Provenance unclear** (not found in the worktree) → **never auto-discard**. Surface the paths / commit summaries and ask the developer via `AskUserQuestion` how to proceed — the change may be their own unrelated work.
3. Create the PR using the appropriate command for the active mode:

   **Issue mode:**
   ```bash
   gh pr create \
     --title "<issue title>" \
     --label "<kind label 1>" \
     --label "<kind label 2 if applicable>" \
     --assignee @me \
     --body "$(cat <<'EOF'
   Closes #<N>

   ## Summary
   <summary of what was built>
   EOF
   )"
   ```
   Use the kind label(s) recorded in Phase 1 step 5 — one `--label` flag per label. The `Closes #<N>` keyword is what links and later closes the issue — no separate action is needed here. When this PR is merged into the repository's default branch, GitHub automatically closes issue #N. The "in progress" label applied in Phase 1 is left in place; it is not removed on close.

   **Ad-hoc mode** — PR title is the human-readable form of the confirmed slug (e.g. `feature-add-player-stats-endpoint` → "Add player stats endpoint"):
   ```bash
   gh pr create \
     --title "<human-readable slug>" \
     --label "<kind label 1>" \
     --label "<kind label 2 if applicable>" \
     --assignee @me \
     --body "$(cat <<'EOF'
   ## Summary
   <summary of what was built>
   EOF
   )"
   ```
   Use the kind label(s) recorded in Phase 1 step 2 — one `--label` flag per label.

   **If `gh pr create` fails** (for any reason — a bad label, a network error, or an assignee failure), report the command's error output to the developer, then ask via `AskUserQuestion` — offering two genuine options:
   - **Retry** — re-run the identical `gh pr create` command. If it fails again, repeat this same handling (report the error, then ask again).
   - **Stop** — halt the skill. The branch is already pushed, but no PR exists yet.

   Per this project's `AskUserQuestion` convention (`CLAUDE.md`), do not add an explicit free-text or chat option — both are provided automatically. This handling is generic to `gh pr create`; an assignee failure is just one of the ways the command can fail, and all of them are handled the same way.

4. After the PR is created, **REQUIRED SUB-SKILL:** Use the `deploy-local` skill to offer the developer a local look at the change. `deploy-local` asks up front which of its six actions to perform — deploy the stack, run the manual import before and/or after the other importers, run the BBL import, run the TP import, generate a SchemaSpy diagram — in any combination; selecting none is valid and means no action is taken. Do not ask the developer separately before invoking it.
   - **Discord slash-command propagation reminder.** Check whether the branch's diff touches Discord slash-command registration or definitions:
     ```bash
     git diff --name-only origin/main...HEAD -- packages/discord-client/src/discord-client.service.ts apps/discord-bot/src/slash-commands/
     ```
     If this prints any file paths, print the following reminder to the developer alongside the `deploy-local` hand-off:
     > This branch changes Discord slash-command registration or definitions. Commands are registered globally, and Discord can take up to ~1 hour to propagate a changed command's name, description, or options — so your slash commands may still show their old definitions in Discord for a while after the deploy. That is expected, not a failed deploy. Changes to how a command answers (handler logic) take effect as soon as the bot restarts.
     If it prints nothing, skip the reminder silently — no status line, no mention.
5. **Skill ends** — human review and merge happen outside this workflow. A future review-bot loop (e.g. Qodo) will run after PR creation, before human review. Once the developer confirms the PR has merged, use the `wrap-up` skill to verify the merge and clean up local state.
