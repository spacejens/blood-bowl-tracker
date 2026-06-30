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

Work through each phase in order. **Do not start the next phase automatically — always pause and wait for the developer to confirm before proceeding.**

---

### Phase 1: Setup

**Detect mode** from the argument:
- No argument → ask the developer to provide an issue number or feature description, then restart Phase 1
- Plain integer (e.g. `42`) → **issue mode**
- Any other text (e.g. `Add player stats endpoint`) → **ad-hoc mode**

**Issue mode:**
1. Fetch the issue:
   ```bash
   gh issue view <N> --json title,body,labels,state
   ```
   If the issue does not exist, `gh` will error — report the error and **stop**.
2. Check the `state` field. If it is not `OPEN`, report "Issue #N is not open (state: `<state>`). Nothing to do." and **stop**.
3. Derive branch name `issue-{N}-{kebab-slug}` from the issue title (lowercase, spaces → hyphens, punctuation stripped). Propose it to the developer and ask them to confirm — they may edit the slug.
   - Example: issue 42 "Add player stats endpoint" → propose `issue-42-add-player-stats-endpoint`
4. **REQUIRED SUB-SKILL:** Use `superpowers:using-git-worktrees` to create an isolated worktree on the confirmed branch name
5. **Pause** — confirm worktree is ready before proceeding to Phase 2

**Ad-hoc mode:**
1. Use the provided text as the feature description
2. Derive a kebab slug from the text. Propose branch name `feature-{kebab-slug}` and ask the developer to confirm — they may edit the slug.
   - Example: "Add player stats endpoint" → propose `feature-add-player-stats-endpoint`
3. **REQUIRED SUB-SKILL:** Use `superpowers:using-git-worktrees` to create an isolated worktree on the confirmed branch name
4. **Pause** — confirm worktree is ready before proceeding to Phase 2

---

### Phase 2: Specification

1. **REQUIRED SUB-SKILL:** Use `superpowers:brainstorming` with the issue content (issue mode) or provided text (ad-hoc mode) as starting context
2. **Override the brainstorming skill's default spec save location:** save the spec to `docs/plans/` (gitignored), not `docs/superpowers/specs/`
3. **Pause** — developer reviews and approves the spec before Phase 3 begins

---

### Phase 3: Planning

1. **REQUIRED SUB-SKILL:** Use `superpowers:writing-plans` with the approved spec as input
2. **Override the writing-plans skill's default plan save location:** save the plan to `docs/plans/` (gitignored)
3. **Pause** — developer reviews and approves the plan before any code is written

---

### Phase 4: Development

1. **REQUIRED SUB-SKILL:** Use `superpowers:subagent-driven-development` to execute the plan
2. For **each task** in the plan, follow this order:
   - **Docs first:** If the task introduces a new concept or constraint, update or create the relevant spec under `docs/` following `docs/spec-conventions.md`
   - **Test first:** Write the failing test — **REQUIRED SUB-SKILL:** Use `superpowers:test-driven-development`
   - **Implement:** Write code until tests pass
   - **Commit:** One commit per completed task; message explains what changed and why
3. If tests fail unexpectedly: **REQUIRED SUB-SKILL:** Use `superpowers:systematic-debugging` before proposing fixes
4. Before marking each task done: **REQUIRED SUB-SKILL:** Use `superpowers:verification-before-completion`
5. After each task: run `pnpm test` from the repo root to confirm no regressions
6. **Pause** — confirm all tasks are complete and all tests are green before proceeding to Phase 5

---

### Phase 5: Self-review

1. **REQUIRED SUB-SKILL:** Use `superpowers:requesting-code-review` across all changes on the branch
2. Fix any findings; re-run `pnpm test` to confirm clean
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
