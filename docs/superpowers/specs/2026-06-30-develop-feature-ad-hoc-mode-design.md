---
name: develop-feature-ad-hoc-mode-design
description: Design spec for ad-hoc mode and six-phase restructure of the develop-feature skill
metadata:
  type: project
---

# develop-feature Ad-hoc Mode & Phase Restructure Design

## Purpose

Extend the `develop-feature` skill to support an ad-hoc invocation mode (free-form text instead of a GitHub issue number), and restructure Phase 5 into two distinct phases for clarity.

## Context

The existing skill supports `/develop-feature 42` (GitHub issue number). This amendment adds `/develop-feature <text>` for self-directed work with no corresponding issue.

Files affected:
- `.claude/skills/develop-feature/SKILL.md` — add mode detection, ad-hoc Phase 1 path, split Phase 5, fix Qodo placement
- `docs/development-workflow.md` — describe ad-hoc mode and six-phase structure

The original design spec (`docs/superpowers/specs/2026-06-30-develop-feature-skill-design.md`) is obsolete and is not updated.

## Mode Detection

At the start of Phase 1, before any other action:

- Argument is a **plain integer** (digits only) → **issue mode** (existing behaviour)
- Argument contains **any non-numeric characters** → **ad-hoc mode** (new)

This is unambiguous: `/develop-feature 42` is issue mode, `/develop-feature 3D rendering support` is ad-hoc mode.

## Six Phases

The skill is restructured from five phases to six by splitting the old Phase 5 (Integration) into Self-review (Phase 5) and Integration (Phase 6).

### Phase 1: Setup

**Issue mode (unchanged):**
1. Fetch issue: `gh issue view <N> --json title,body,labels`
2. Derive branch name: `issue-{N}-{kebab-slug}` from issue title
3. Create worktree via `superpowers:using-git-worktrees`
4. Pause

**Ad-hoc mode (new):**
1. Use provided text as the feature description
2. Derive kebab slug from the text; propose branch name `feature-{kebab-slug}`; ask the developer to confirm (they may edit the slug)
3. Create worktree on the confirmed branch name via `superpowers:using-git-worktrees`
4. Pause

### Phases 2–4: Specification, Planning, Development

Identical in both modes. No changes from the existing design.

### Phase 5: Self-review (split from old Phase 5)

1. Invoke `superpowers:requesting-code-review` across all changes on the branch
2. Fix any findings; re-run `pnpm test` to confirm clean
3. Repeat steps 1–2 until review is clean and tests pass
4. Pause before Phase 6

### Phase 6: Integration (split from old Phase 5)

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

**Ad-hoc mode:**
- PR title: human-readable form of the confirmed slug
  (e.g. `feature-add-player-stats-endpoint` → "Add player stats endpoint")
- No `Closes #N` — PR body contains summary only

```bash
gh pr create \
  --title "<human-readable slug>" \
  --body "$(cat <<'EOF'
## Summary
<summary of what was built>
EOF
)"
```

Skill ends. Human review happens outside this workflow. A future review-bot loop (e.g. Qodo) runs **after PR creation** at this point, before human review.

## Branch Naming

| Mode | Convention | Example |
|------|-----------|---------|
| Issue | `issue-{N}-{kebab-slug}` | `issue-42-add-player-stats-endpoint` |
| Ad-hoc | `feature-{kebab-slug}` | `feature-add-player-stats-endpoint` |

In ad-hoc mode, the slug is confirmed with the developer before the branch is created. The branch name is locked in at Setup, before brainstorming.

## PR / Issue Linking

| Mode | Linking |
|------|---------|
| Issue | `Closes #N` in PR body — GitHub auto-links and auto-closes on merge |
| Ad-hoc | No issue link — PR body contains summary only |

There is no retroactive issue creation for ad-hoc features. A PR without a linked issue is intentional and acceptable.

## docs/development-workflow.md Changes

- Update phase count from five to six throughout
- Add a section on ad-hoc invocation: when to use it, how to invoke it (`/develop-feature <text>`), what differs (branch naming, no issue link), what stays the same

## Scope Decisions

- Design spec file from previous session is left untouched (obsolete)
- README.md does not need updating — the one-liner still holds
- No retroactive issue creation in ad-hoc mode
- Branch name confirmed at Setup (before brainstorming), not after
