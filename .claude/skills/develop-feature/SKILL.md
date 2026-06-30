---
name: develop-feature
description: Use when starting work on a GitHub issue in the blood-bowl-tracker project — takes an issue number and guides development from branch creation to a pull request ready for human review
---

# develop-feature

Structured feature development from GitHub issue to pull request. See [docs/development-workflow.md](../../docs/development-workflow.md) for the human-readable explanation of this process.

## Invocation

```
/develop-feature <N>
```

e.g. `/develop-feature 42`

## Phases

Work through each phase in order. **Do not start the next phase automatically — always pause and wait for the developer to confirm before proceeding.**

---

### Phase 1: Setup

1. Fetch the issue:
   ```bash
   gh issue view <N> --json title,body,labels
   ```
2. Derive the branch name: `issue-{N}-{kebab-slug}`
   - Slug from the issue title: lowercase, spaces → hyphens, punctuation stripped
   - Example: issue 42 "Add player stats endpoint" → `issue-42-add-player-stats-endpoint`
3. **REQUIRED SUB-SKILL:** Use `superpowers:using-git-worktrees` to create an isolated worktree on that branch
4. **Pause** — confirm worktree is ready before proceeding to Phase 2

---

### Phase 2: Specification

1. **REQUIRED SUB-SKILL:** Use `superpowers:brainstorming` with the issue content as starting context
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

### Phase 5: Integration

1. **REQUIRED SUB-SKILL:** Use `superpowers:requesting-code-review` across all changes on the branch
2. Fix any findings; re-run `pnpm test` to confirm clean
3. Create the PR:
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
4. **Skill ends** — human review and merge happen outside this workflow
   - Future: a review-bot loop (e.g. Qodo) will run between steps 2 and 3
