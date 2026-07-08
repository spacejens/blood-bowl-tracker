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
   gh issue view <N> --json title,body,labels,state,assignees,url
   ```
   If the issue does not exist, `gh` will error — report the error and **stop**.
2. Check whether `<N>` is actually a pull request, not an issue: if the returned `url` contains `/pull/` (issue URLs are `.../issues/<N>`; PR URLs are `.../pull/<N>`), report "Issue #N is a pull request, not an issue. Nothing to do." and **stop** — do not proceed to the state check, assignment, branch naming, or worktree creation.
3. Check the `state` field. If it is not `OPEN`, report "Issue #N is not open (state: `<state>`). Nothing to do." and **stop**.
4. Claim the issue:
   - Determine the current `gh` user:
     ```bash
     gh api user --jq .login
     ```
     If this command fails, report a one-line warning and **continue** — skip the assign/label step but still determine and record the kind label below (it does not depend on the current user), then proceed to step 5 to derive the branch name.
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
5. **Pause** — derive branch name `issue-{N}-{kebab-slug}` from the issue title (lowercase, spaces → hyphens, punctuation stripped), propose it to the developer, and wait for confirmation before proceeding; they may edit the slug.
   - Example: issue 42 "Add player stats endpoint" → propose `issue-42-add-player-stats-endpoint`
6. **REQUIRED SUB-SKILL:** Use `superpowers:using-git-worktrees` to create an isolated worktree on the confirmed branch name
7. **Link the plans directory** so specs and plans from Phase 2–3 are saved outside the worktree and survive its removal:
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
8. Build the whole application so later tasks don't fail due to an unbuilt workspace dependency:
   ```bash
   pnpm build
   ```
   If this fails, report the failure and stop — do not proceed into Phase 2 with a broken baseline.
9. Print a brief status line confirming the worktree path, build result, and baseline test result, then continue immediately into Phase 2.

**Ad-hoc mode:**
1. Use the provided text as the feature description
2. Determine the kind label — one or more of `feature`, `bug`, `development` — by judging from the provided text which clearly apply. More than one may apply; assign all that clearly do. If it's genuinely unclear, ask the developer to choose via `AskUserQuestion`, offering `feature`, `bug`, and `development` as multi-select options. Record the result — Phase 6 uses it when creating the PR. Nothing is applied to GitHub yet, since there is no issue or PR to attach a label to until Phase 6.
3. **Pause** — derive a kebab slug from the text, propose branch name `feature-{kebab-slug}`, and wait for confirmation before proceeding; the developer may edit the slug.
   - Example: "Add player stats endpoint" → propose `feature-add-player-stats-endpoint`
4. **REQUIRED SUB-SKILL:** Use `superpowers:using-git-worktrees` to create an isolated worktree on the confirmed branch name
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
6. Build the whole application so later tasks don't fail due to an unbuilt workspace dependency:
   ```bash
   pnpm build
   ```
   If this fails, report the failure and stop — do not proceed into Phase 2 with a broken baseline.
7. Print a brief status line confirming the worktree path, build result, and baseline test result, then continue immediately into Phase 2.

---

### Phase 2: Specification

1. **REQUIRED SUB-SKILL:** Use `superpowers:brainstorming` with the issue content (issue mode) or provided text (ad-hoc mode) as starting context
2. **Override the brainstorming skill's default spec save location:** save the spec to `docs/plans/` (gitignored), not `docs/superpowers/specs/`
3. **Pause** — ask the developer to review the written spec via `AskUserQuestion`, offering two genuine options: "Approve, move to planning" (proceed to Phase 3) and "Revise the spec" (return to `superpowers:brainstorming` to make changes, then ask again). Per this project's `AskUserQuestion` convention (`CLAUDE.md`), do not add an explicit free-text or chat option — both are provided automatically.

---

### Phase 3: Planning

1. Dispatch a foreground `Agent` call (`model: "opus"`, `run_in_background: false` — Phase 4 depends on its output) to run `superpowers:writing-plans` against the approved spec. Every shell command in its dispatch prompt must be prefixed with `cd <worktree-path> &&`, per the "Subagent dispatch discipline" section above. The dispatch prompt must tell the agent to:
   - Read the approved spec at `docs/plans/<spec-filename>.md` (pass the exact filename from Phase 2)
   - Follow `superpowers:writing-plans`, saving the plan to `docs/plans/` (gitignored) instead of that skill's own default location
   - Skip its "Execution Handoff" question — this workflow always uses `subagent-driven-development` (see Phase 4) — and report back only the saved plan's filename
   Planning is delegated to Opus (rather than Phase 2's brainstorming, which stays inline) because it's a bounded, non-interactive task — turning an already-approved spec into a plan file — while brainstorming needs live back-and-forth with the developer that a dispatched subagent handles poorly. This targets the extra reasoning power at one focused step without spending it on the token-heavy implementation phase.
2. After the agent reports its saved plan filename, verify the file exists at that path in the worktree before continuing (`git -C <worktree-path> status -- docs/plans/<filename>.md` or a direct file check) — do not trust the report alone.
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

1. Create the PR using the appropriate command for the active mode:

   **Issue mode:**
   ```bash
   gh pr create \
     --title "<issue title>" \
     --label "<kind label 1>" \
     --label "<kind label 2 if applicable>" \
     --body "$(cat <<'EOF'
   Closes #<N>

   ## Summary
   <summary of what was built>
   EOF
   )"
   ```
   Use the kind label(s) recorded in Phase 1 step 4 — one `--label` flag per label. The `Closes #<N>` keyword is what links and later closes the issue — no separate action is needed here. When this PR is merged into the repository's default branch, GitHub automatically closes issue #N. The "in progress" label applied in Phase 1 is left in place; it is not removed on close.

   **Ad-hoc mode** — PR title is the human-readable form of the confirmed slug (e.g. `feature-add-player-stats-endpoint` → "Add player stats endpoint"):
   ```bash
   gh pr create \
     --title "<human-readable slug>" \
     --label "<kind label 1>" \
     --label "<kind label 2 if applicable>" \
     --body "$(cat <<'EOF'
   ## Summary
   <summary of what was built>
   EOF
   )"
   ```
   Use the kind label(s) recorded in Phase 1 step 2 — one `--label` flag per label.

2. After the PR is created, **REQUIRED SUB-SKILL:** Use the `deploy-local` skill to offer the developer a local look at the change. `deploy-local` asks up front whether to deploy the stack, run the BBL import, or both — selecting neither is valid and means no action is taken. Do not ask the developer separately before invoking it.
3. **Skill ends** — human review and merge happen outside this workflow. A future review-bot loop (e.g. Qodo) will run after PR creation, before human review. Once the developer confirms the PR has merged, use the `wrap-up` skill to verify the merge and clean up local state.
