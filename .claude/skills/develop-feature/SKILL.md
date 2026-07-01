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

---

### Phase 1: Setup

**Detect mode** from the argument:
- No argument → ask the developer to provide an issue number or feature description, then restart Phase 1
- Plain integer (e.g. `42`) → **issue mode**
- Any other text (e.g. `Add player stats endpoint`) → **ad-hoc mode**

**Issue mode:**
1. Fetch the issue:
   ```bash
   gh issue view <N> --json title,body,labels,state,assignees
   ```
   If the issue does not exist, `gh` will error — report the error and **stop**.
2. Check the `state` field. If it is not `OPEN`, report "Issue #N is not open (state: `<state>`). Nothing to do." and **stop**.
3. Claim the issue:
   - Determine the current `gh` user:
     ```bash
     gh api user --jq .login
     ```
     If this command fails, report a one-line warning and **continue** — skip the assign/label step but proceed to step 4 to derive the branch name.
   - If the issue's `assignees` array is non-empty and does not include the current user's login, report "Issue #N is already assigned to `<assignee login(s)>`. Stopping." and **stop** — do not derive a branch name or create a worktree.
   - Otherwise (unassigned, or already assigned to the current user), assign and label it:
     ```bash
     gh issue edit <N> --add-assignee @me
     gh issue edit <N> --add-label "in progress"
     ```
     Run these as two separate commands so a failure in one doesn't mask the other. If either command fails, report a one-line warning (e.g. "Could not assign issue #N to you — continuing anyway: `<gh error output>`") and **continue** — do not stop the workflow over a labeling/assignment failure.
4. Derive branch name `issue-{N}-{kebab-slug}` from the issue title (lowercase, spaces → hyphens, punctuation stripped). Propose it to the developer and ask them to confirm — they may edit the slug.
   - Example: issue 42 "Add player stats endpoint" → propose `issue-42-add-player-stats-endpoint`
5. **REQUIRED SUB-SKILL:** Use `superpowers:using-git-worktrees` to create an isolated worktree on the confirmed branch name
6. Print a brief status line confirming the worktree path and baseline test result, then continue immediately into Phase 2.

**Ad-hoc mode:**
1. Use the provided text as the feature description
2. Derive a kebab slug from the text. Propose branch name `feature-{kebab-slug}` and ask the developer to confirm — they may edit the slug.
   - Example: "Add player stats endpoint" → propose `feature-add-player-stats-endpoint`
3. **REQUIRED SUB-SKILL:** Use `superpowers:using-git-worktrees` to create an isolated worktree on the confirmed branch name
4. Print a brief status line confirming the worktree path and baseline test result, then continue immediately into Phase 2.

---

### Phase 2: Specification

1. **REQUIRED SUB-SKILL:** Use `superpowers:brainstorming` with the issue content (issue mode) or provided text (ad-hoc mode) as starting context
2. **Override the brainstorming skill's default spec save location:** save the spec to `docs/plans/` (gitignored), not `docs/superpowers/specs/`
3. **Pause** — developer reviews and approves the spec before Phase 3 begins

---

### Phase 3: Planning

1. **REQUIRED SUB-SKILL:** Use `superpowers:writing-plans` with the approved spec as input. That skill's "Execution Handoff" step asks which execution approach to use (Subagent-Driven vs. Inline) — skip that question here. This workflow always uses subagent-driven-development (see Phase 4), so proceed straight to Phase 4 once the plan is approved without asking the developer to choose an approach.
2. **Override the writing-plans skill's default plan save location:** save the plan to `docs/plans/` (gitignored)
3. **Pause** — developer reviews and approves the plan before any code is written

---

### Phase 4: Development

1. **REQUIRED SUB-SKILL:** Use `superpowers:subagent-driven-development` to execute the plan. This is the only execution approach used in this workflow — do not ask the developer to choose between this and any alternative (e.g. `executing-plans`); proceed directly into subagent-driven-development.
2. For **each task** in the plan, follow this order:
   - **Docs first:** If the task introduces a new concept or constraint, update or create the relevant spec under `docs/` following `docs/spec-conventions.md`
   - **Test first:** Write the failing test — **REQUIRED SUB-SKILL:** Use `superpowers:test-driven-development`
   - **Implement:** Write code until tests pass
   - **Commit:** One commit per completed task; message explains what changed and why
3. If tests fail unexpectedly: **REQUIRED SUB-SKILL:** Use `superpowers:systematic-debugging` before proposing fixes
4. Before marking each task done: **REQUIRED SUB-SKILL:** Use `superpowers:verification-before-completion`
5. After each task: run `pnpm verify` from the repo root to confirm no regressions (build, lint, typecheck, test). When lint or formatting checks fail, run `pnpm lint:fix` and/or `pnpm format:fix` first; only hand-edit failures those commands can't auto-resolve.
6. Print a brief status line confirming all tasks are complete and `pnpm verify` is green, then continue immediately into Phase 5.

---

### Phase 5: Self-review

1. **REQUIRED SUB-SKILL:** Use `superpowers:requesting-code-review` across all changes on the branch
2. Fix any findings; re-run `pnpm verify` to confirm clean
3. Repeat steps 1–2 until the review is clean and all tests pass
4. **Pause** — confirm review is clean before proceeding to Phase 6

---

### Phase 6: Integration

1. Create the PR using the appropriate command for the active mode:

   **Issue mode:**
   ```bash
   gh pr create \
     --title "<issue title>" \
     --body "$(cat <<'EOF'
   Closes #<N>

   ## Summary
   <summary of what was built>
   EOF
   )"
   ```
   The `Closes #<N>` keyword is what links and later closes the issue — no separate action is needed here. When this PR is merged into the repository's default branch, GitHub automatically closes issue #N. The "in progress" label applied in Phase 1 is left in place; it is not removed on close.

   **Ad-hoc mode** — PR title is the human-readable form of the confirmed slug (e.g. `feature-add-player-stats-endpoint` → "Add player stats endpoint"):
   ```bash
   gh pr create \
     --title "<human-readable slug>" \
     --body "$(cat <<'EOF'
   ## Summary
   <summary of what was built>
   EOF
   )"
   ```

2. **Skill ends** — human review and merge happen outside this workflow. A future review-bot loop (e.g. Qodo) will run after PR creation, before human review.
