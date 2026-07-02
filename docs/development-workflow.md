# Development Workflow

Three Claude Code skills structure how work happens in this project: `develop-feature` builds features, `handle-pr-reviews` processes review feedback on open pull requests, and `code-hygiene` keeps dependencies and code clean independent of any specific feature. Each isolates its work in a git worktree and produces (or updates) a pull request; human review and merge always happen outside the Claude workflow.

Each skill's own `SKILL.md` under `.claude/skills/` is the source of truth for its exact phase-by-phase behavior — this document only orients you to which skill to reach for and how they fit together.

## develop-feature

Builds a feature end-to-end: from a GitHub issue (`/develop-feature 42`) or a free-form description (`/develop-feature Add player stats endpoint`), through brainstorming a spec, writing an implementation plan, implementing it task-by-task with tests, self-review, and opening a PR. This is the default entry point for any new feature or bug fix.

## handle-pr-reviews

Processes reviewer feedback on an already-open PR (`/handle-pr-reviews`, or `/handle-pr-reviews <N>` for a specific PR). Finds unhandled inline and top-level comments, fixes or rejects each with verification, pushes the results, and replies to every comment. Run this after a PR — from `develop-feature` or otherwise — receives review feedback, including Claude's own self-review comments.

## code-hygiene

Runs a fixed set of dependency and code cleanup checks — dependency updates, unused dependency/dead code removal, a security audit, workspace version consistency, circular dependency detection, lint, and format — and opens a PR with the results (`/code-hygiene`). Unlike `develop-feature`, there's no specification or planning step: the checks and their order are fixed. Run this periodically, or whenever the codebase needs a cleanup pass, independent of feature work.

## How they fit together

A typical cycle: `develop-feature` takes an issue to a PR → reviewers leave feedback → `handle-pr-reviews` addresses it → the PR merges. `code-hygiene` runs on its own schedule, whenever a developer chooses, unrelated to any specific feature PR — it keeps dependencies current and the codebase free of dead code and lint/format drift. All three skills share the same underlying conventions: branch naming, worktree isolation, `pnpm verify` after each task, and a self-review pass before opening a PR.
