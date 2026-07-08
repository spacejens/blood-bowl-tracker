---
name: write-issue
description: Use to turn a rough idea or request into one or more well-worded GitHub issues for the blood-bowl-tracker project — refines intent through a short clarifying dialogue, matches this repo's existing issue style (plain-text intent and purpose, not overly specific), and can produce several issues from one request (e.g. "find remaining missing features for X and write an issue for each")
---

# write-issue

Turns a free-form prompt into one or more GitHub issues that match this repo's existing style: plain-text description of the need and its purpose, not overly specific about implementation, leaving the "how" to whoever picks up the work later (so the issue doesn't go stale the moment implementation details change).

## Invocation

```
/write-issue <text>
```

`<text>` may describe a single idea, or a meta-request that should yield several issues (e.g. "find remaining missing features for the Discord bot's stats command and write an issue for each").

## Phase 1: Enumerate candidates

If `<text>` describes a single concrete idea, the only candidate is that idea — skip to Phase 2.

If `<text>` is a meta-request (asks Claude to find multiple things and write an issue for each):
1. Research using whatever the request implies — grep the codebase, read relevant docs, or check `gh issue list --state all` for related existing issues.
2. Present the candidate list to the developer via `AskUserQuestion` (multi-select) so they can confirm which candidates to actually draft. Do not draft every candidate automatically — over-creating issues is worse than asking first.

## Phase 2: Refine each candidate

For each confirmed candidate, run a short one-question-at-a-time clarifying dialogue — in the spirit of `superpowers:brainstorming`'s clarifying-questions style, but not that skill itself (its hard-gated terminal step is `writing-plans`, which doesn't apply here since no code or worktree is involved). Ask about purpose and rough scope only:

- What need or problem is this addressing, and why does it matter?
- Is there a natural boundary to this piece of work, distinct from other ideas already captured?

Explicitly avoid drilling into implementation details or asking for code — this repo's existing issues (e.g. issue #49) state the need and its purpose in plain text and leave the "how" to the developer implementing it later.

Before drafting, check `gh issue list --state open` for issues that look like likely duplicates or heavy overlap with the candidate. If found, flag it to the developer via `AskUserQuestion` with two genuine options: "Create anyway" (a new, sufficiently distinct issue) and "Skip this one" (the existing issue already covers it).

## Phase 3: Draft and create

For each candidate that passes Phase 2:
1. Draft a title and a plain-text body describing the need and its purpose (no code blocks, no implementation prescriptions), matching the tone of this repo's existing issues.
2. Present the draft to the developer via `AskUserQuestion` with two genuine options: "Create it" and "Revise the draft" (loop back into Phase 2's dialogue for this candidate, then re-draft).
3. Determine the kind label(s) — one or more of `feature`, `bug`, `development` — the same way `develop-feature`'s ad-hoc mode does: judge from the drafted content which clearly apply; if genuinely unclear, ask via `AskUserQuestion` (multi-select).
4. Create the issue:
   ```bash
   gh issue create --title "<title>" --label "<kind label 1>" --label "<kind label 2 if applicable>" --body "$(cat <<'EOF'
   <body>
   EOF
   )"
   ```
5. Report the created issue's URL to the developer.

## Non-goals

- No worktree, no branch, no code changes — this skill only produces GitHub issues.
- Does not assign the issue or apply an "in progress" label — that happens later, when `develop-feature` picks the issue up.
