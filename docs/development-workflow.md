# Development Workflow

Development in this project is structured by a set of Claude Code skills — see the subsections below for what each one does.

Each skill isolates its work in its own git worktree, so it never touches your current checkout while it runs.

Every skill converges on a pull request rather than merging anything itself: human review and merge always happen outside the Claude workflow, so every change is visible on GitHub before it lands.

Each skill's own `SKILL.md` under `.claude/skills/` is the source of truth for its exact phase-by-phase behavior — this document only orients you to which skill to reach for and how they fit together.

## develop-feature

Builds a feature end-to-end: from a GitHub issue (`/develop-feature 42`) or a free-form description (`/develop-feature Add player stats endpoint`), through brainstorming a spec, writing an implementation plan, implementing it task-by-task with tests, self-review, and opening a PR. This is the default entry point for any new feature or bug fix.

## handle-pr-reviews

Processes reviewer feedback on an already-open PR (`/handle-pr-reviews`, or `/handle-pr-reviews <N>` for a specific PR). Finds unhandled inline and top-level comments, fixes or rejects each with verification, pushes the results, and replies to every comment. Run this after a PR — from `develop-feature` or otherwise — receives review feedback, including Claude's own self-review comments.

## code-hygiene

Runs a fixed set of dependency and code cleanup checks — dependency updates, unused dependency/dead code removal, a security audit, workspace version consistency, circular dependency detection, lint, and format — and opens a PR with the results (`/code-hygiene`). Unlike `develop-feature`, there's no specification or planning step: the checks and their order are fixed. Run this periodically, or whenever the codebase needs a cleanup pass, independent of feature work.

## wrap-up

Verifies that work the developer says is finished is actually finished — checks the PR really merged on GitHub and that nothing was left uncommitted or unpushed outside the worktree — then offers to stop local Docker containers, remove the git worktree, and delete the local branch. Triggered conversationally (e.g. "that's merged") rather than by a slash command; run this after a `develop-feature` or `handle-pr-reviews` cycle's PR has merged.

## How they fit together

A typical cycle: `develop-feature` takes an issue to a PR → reviewers leave feedback → `handle-pr-reviews` addresses it → the PR merges → `wrap-up` verifies the merge and cleans up local state. `code-hygiene` runs on its own schedule, whenever a developer chooses, unrelated to any specific feature PR — it keeps dependencies current and the codebase free of dead code and lint/format drift.
