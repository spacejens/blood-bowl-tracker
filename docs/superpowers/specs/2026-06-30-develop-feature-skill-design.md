---
name: develop-feature-skill-design
description: Design spec for the develop-feature project-level Claude skill
metadata:
  type: project
---

# develop-feature Skill Design

## Purpose

A project-level Claude skill that takes a GitHub issue number and guides structured feature development from issue to merged PR — specifying, planning, coding, testing, documenting, and reviewing without requiring GitHub Actions.

## Context

- Invoked as `/develop-feature <issue-number>` (e.g. `/develop-feature 42`)
- Project-level skill: `.claude/skills/develop-feature/SKILL.md`
- Composes existing superpowers skills rather than defining its own sub-workflows
- No GitHub Actions budget: tests, code review, and verification are all Claude-driven
- GitHub issues are often underdefined; the skill starts with a brainstorming session to flesh them out

## Five Phases

### Phase 1: Setup

- Fetch the issue with `gh issue view <N>` to read title, body, and labels
- Derive branch name as `issue-{N}-{kebab-slug}` where the slug comes from the issue title
- Invoke `superpowers:using-git-worktrees` to create an isolated worktree on that branch
- **Pause** before proceeding — confirm branch and worktree are ready

### Phase 2: Specification

- Invoke `superpowers:brainstorming` with the issue as starting context
- Work with the developer to flesh out the feature: clarify intent, define scope, resolve ambiguities
- Brainstorming saves its spec to `docs/plans/` (overriding the skill's default `docs/superpowers/specs/` path), since this is a temporary working document, not a permanent project spec
- **Pause** — developer reviews and approves the spec before proceeding

### Phase 3: Planning

- Invoke `superpowers:writing-plans` using the approved spec as input
- Implementation plan is saved to `docs/plans/` (gitignored — never committed)
- **Pause** — developer reviews and approves the plan before any code is written

### Phase 4: Development

- Invoke `superpowers:subagent-driven-development` to execute the plan
- Each task in the plan follows this order:
  1. Update or create the relevant `docs/` spec following `docs/spec-conventions.md` (if the task introduces a new concept or constraint)
  2. Write the test first (`superpowers:test-driven-development`)
  3. Write the code until tests pass
  4. Commit with a message explaining what changed and why
- If tests fail unexpectedly, invoke `superpowers:systematic-debugging` before proposing fixes
- Run `superpowers:verification-before-completion` before marking each task done
- Run `pnpm test` (from repo root) after each task to confirm nothing is broken

### Phase 5: Integration

- Invoke `superpowers:requesting-code-review` across all changes on the branch
- Fix any findings; re-run `pnpm test` to confirm clean
- Create PR using `gh pr create`:
  - Title derived from the issue title
  - Body containing `Closes #N` (GitHub auto-links and auto-closes the issue on merge)
  - Summary of changes made
- **Skill ends** — human review and merge happen outside Claude's workflow
- Future: a review-bot loop (e.g. Qodo) slots in here before the PR is handed to human review

## Branch Naming

`issue-{N}-{kebab-slug}` — e.g. `issue-42-add-player-stats-endpoint`

The slug is derived from the issue title: lowercase, spaces to hyphens, punctuation stripped.

## PR / Issue Linking

Using `Closes #N` in the PR body causes GitHub to:
- Display the linked issue on the PR page
- Auto-close the issue when the PR is merged

## Process Documentation

A new file `docs/development-workflow.md` documents this process for human readers (not for Claude). It covers: the five-phase flow, what to expect at each phase, branch naming convention, how issue/PR linking works, and how to invoke the skill. README.md links to it.

The skill itself references `docs/development-workflow.md` so developers can read the human-friendly explanation alongside the skill.

## Scope Decisions

- Brainstorming spec and implementation plan are both gitignored (`docs/plans/`) — temporary working documents
- Permanent feature documentation goes in the appropriate `docs/` subfolder, written during Phase 4
- The Integration phase is a self-contained block by design, so it can move earlier when a review-bot loop is added
- Skill does not handle merging — that remains a human action

## Files Created or Modified

| File | Status | Notes |
|------|--------|-------|
| `.claude/skills/develop-feature/SKILL.md` | New | The skill itself |
| `docs/development-workflow.md` | New | Human-readable process explanation |
| `README.md` | Modified | Add link to `docs/development-workflow.md` |
