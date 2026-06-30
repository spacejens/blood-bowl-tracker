# Development Workflow

Features in this project are developed using [Claude Code](https://claude.ai/code) with the `develop-feature` skill, which guides you from a GitHub issue through to a pull request in a structured way.

## How to start

Pick a GitHub issue to work on, then invoke the skill in Claude Code with the issue number:

```
/develop-feature 42
```

Claude takes it from there, pausing for your review at the end of each phase before proceeding.

## The five phases

### 1. Setup

Claude fetches the issue from GitHub and creates an isolated git branch and worktree:

- Branch name: `issue-{N}-{kebab-slug}` — e.g. `issue-42-add-player-stats-endpoint`
- A git worktree is created so your main working directory stays clean

### 2. Specification

Claude conducts a brainstorming session with you to flesh out the issue. GitHub issues are often short on detail, so this step clarifies intent, scope, and constraints before any code is written.

The resulting spec is saved to `docs/plans/` (gitignored — it is a temporary working document, not a permanent project spec).

### 3. Planning

Claude turns the approved spec into a detailed task-by-task implementation plan, also saved to `docs/plans/` (gitignored). You review and approve the plan before development begins.

### 4. Development

Claude executes the plan task by task. For each task:

1. Relevant `docs/` specs are updated or created first (if the task introduces a new concept or constraint)
2. Tests are written before implementation (TDD)
3. Code is written until tests pass
4. Changes are committed with an explanatory message

After each task, `pnpm test` is run from the repo root to catch regressions.

### 5. Integration

Claude runs a self-review across all changes on the branch, fixes any findings, then creates a pull request:

- The PR title comes from the issue title
- The PR body contains `Closes #N`, which GitHub uses to auto-link the issue and auto-close it when the PR is merged

At this point, development is done. Human review and merging happen outside the Claude workflow.

## What gets committed

| Item | Committed? |
|------|-----------|
| Feature code | Yes |
| Tests | Yes |
| `docs/` spec updates | Yes |
| Brainstorming spec (`docs/plans/`) | No — gitignored |
| Implementation plan (`docs/plans/`) | No — gitignored |
