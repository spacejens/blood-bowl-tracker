# Development Workflow

Features in this project are developed using [Claude Code](https://claude.ai/code) with the `develop-feature` skill, which guides you from a GitHub issue (or a free-form description) through to a pull request in a structured way.

## How to start

**Issue mode** — when working on an existing GitHub issue:

```
/develop-feature 42
```

**Ad-hoc mode** — when starting from a free-form description with no GitHub issue:

```
/develop-feature Add player stats endpoint
```

If the argument is a plain integer, issue mode is used. Any other text triggers ad-hoc mode.

Claude takes it from there. You'll be asked to confirm the branch name (start of Phase 1), and to review and approve the spec (end of Phase 2), the implementation plan (end of Phase 3), and the final self-review before a pull request is opened (end of Phase 5). Other phase transitions happen automatically, with a brief status update.

## The six phases

### 1. Setup

Claude creates an isolated git branch and worktree. The derived branch name is proposed for your confirmation — you may edit the slug before the branch is created.

- **Issue mode:** fetches the issue from GitHub. If it's open and unassigned (or already assigned to you), Claude assigns it to you and applies the "in progress" label before continuing. If it's already assigned to someone else, Claude stops there instead of claiming it. If either the assignment or label application fails, Claude warns and continues anyway. Branch name is `issue-{N}-{kebab-slug}` — e.g. `issue-42-add-player-stats-endpoint`
- **Ad-hoc mode:** uses your provided text; branch name is `feature-{kebab-slug}` — e.g. `feature-add-player-stats-endpoint`

Once the worktree is created and baseline tests pass, Claude proceeds automatically into Phase 2 — no approval is needed at this step.

### 2. Specification

Claude conducts a brainstorming session with you to flesh out the feature. GitHub issues and ad-hoc descriptions are often short on detail — this step clarifies intent, scope, and constraints before any code is written.

The resulting spec is saved to `docs/plans/` (gitignored — it is a temporary working document, not a permanent project spec).

### 3. Planning

Claude turns the approved spec into a detailed task-by-task implementation plan, also saved to `docs/plans/` (gitignored). You review and approve the plan before development begins. This workflow always executes plans via subagent-driven-development — Claude does not ask you to choose an execution approach.

### 4. Development

Claude executes the plan task by task. For each task:

1. Relevant `docs/` specs are updated or created first (if the task introduces a new concept or constraint)
2. Tests are written before implementation (TDD)
3. Code is written until tests pass
4. Changes are committed with an explanatory message

After each task, `pnpm verify` is run from the repo root to catch regressions — this covers build, lint, typecheck, and test together. When `pnpm verify` reports lint or formatting failures, `pnpm lint:fix` and/or `pnpm format:fix` are run first; hand-editing is reserved for failures those commands can't auto-resolve (genuine lint/type errors, not style).

Once all tasks are complete and `pnpm verify` is green, Claude proceeds automatically into Phase 5 — no approval is needed at this step.

### 5. Self-review

Claude runs a code review across all changes on the branch, fixes any findings, and reruns `pnpm verify`. This repeats until the review is clean and `pnpm verify` passes.

### 6. Integration

Claude creates a pull request:

- **Issue mode:** PR title comes from the issue title; PR body contains `Closes #N`, which GitHub uses to auto-link the issue and auto-close it when the PR is merged into the default branch. No separate action is needed for this — it's native GitHub behavior. The "in progress" label applied during Setup stays on the issue after it closes.
- **Ad-hoc mode:** PR title is the human-readable form of the confirmed branch slug; PR body contains a summary only (no issue link)

At this point, development is done. Human review and merging happen outside the Claude workflow.

## What gets committed

| Item | Committed? |
|------|-----------|
| Feature code | Yes |
| Tests | Yes |
| `docs/` spec updates | Yes |
| Brainstorming spec (`docs/plans/`) | No — gitignored |
| Implementation plan (`docs/plans/`) | No — gitignored |
