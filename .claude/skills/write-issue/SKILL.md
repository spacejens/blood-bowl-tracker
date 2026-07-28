---
name: write-issue
description: Use to turn a rough idea or request into one or more well-worded GitHub issues for the blood-bowl-tracker project — refines intent through a short clarifying dialogue, matches this repo's existing issue style (plain-text intent and purpose, not overly specific), and can produce several issues from one request (e.g. "find remaining missing features for X and write an issue for each"). Also handles sub-issues: adding one or more new issues as sub-issues of an existing issue, or splitting a larger piece of work into a new parent issue with several sub-issues.
---

# write-issue

Turns a free-form prompt into one or more GitHub issues that match this repo's existing style: plain-text description of the need and its purpose, not overly specific about implementation, leaving the "how" to whoever picks up the work later (so the issue doesn't go stale the moment implementation details change).

## Invocation

```
/write-issue <text>
```

`<text>` may describe a single idea, a meta-request that should yield several issues (e.g. "find remaining missing features for the Discord bot's stats command and write an issue for each"), or a sub-issue request (see below).

### Sub-issues

`<text>` may ask for candidates to be created as GitHub sub-issues rather than standalone issues, in one of two shapes:

- **Sub-issues of an existing issue** — e.g. "split #150 into sub-issues for X, Y, and Z", or "add a sub-issue to #150 for W". The named issue is the parent; every candidate becomes a sub-issue of it. The parent already exists, so its number is known before Phase 3.
- **New parent with sub-issues** — e.g. "create a parent issue for the stats rework with sub-issues for each metric". No existing parent is named; the parent issue is itself a candidate, drafted and confirmed like any other in Phases 2–3, but it must be created *before* its children so its number is available to link them.

Carry which mode applies (if any), and the parent issue number or which candidate is the to-be-created parent, through Phases 2 and 3.

## Phase 1: Enumerate candidates

If `<text>` describes a single concrete idea (a single issue, or a single sub-issue of a named parent), the only candidate is that idea — skip to Phase 2.

If `<text>` is a meta-request (asks Claude to find multiple things and write an issue — or sub-issue — for each):
1. Research using whatever the request implies — grep the codebase, read relevant docs, or check `gh issue list --state all` for related existing issues.
2. Present the candidate list to the developer via `AskUserQuestion` (multi-select) so they can confirm which candidates to actually draft. Do not draft every candidate automatically — over-creating issues is worse than asking first. The candidate list is variable-length and `AskUserQuestion` allows at most 4 options per question, so split the candidates across consecutive `multiSelect: true` questions of at most 4 candidates each, in the order you presented them, all sent in a **single** call; the union of the answers is the confirmed set. Never add an option of your own invention — no "None", "All", or "Skip the rest" — since deselecting everything already means none. A single call caps out at 4 questions × 4 options = 16 candidates. If research turned up more than 16, do not rank and drop the excess — ask about the first 16 in one call, then ask about the remaining candidates in a follow-up call, repeating until every candidate has been offered. Say how many batches there are when you ask the first one, so the developer knows more is coming. See the `AskUserQuestion` option-ceiling and don't-invent-options rules in `CLAUDE.md`'s "Developer prompts" section.

In the new-parent-with-sub-issues shape, present the parent as its own candidate in this list alongside the children, so the developer can deselect it in favor of an existing issue if one already fits.

## Phase 2: Refine each candidate

For each confirmed candidate, run a short one-question-at-a-time clarifying dialogue — in the spirit of `superpowers:brainstorming`'s clarifying-questions style, but not that skill itself (its hard-gated terminal step is `writing-plans`, which doesn't apply here since no code or worktree is involved). Ask about purpose and rough scope only:

- What need or problem is this addressing, and why does it matter?
- Is there a natural boundary to this piece of work, distinct from other ideas already captured?

Explicitly avoid drilling into implementation details or asking for code — this repo's existing issues (e.g. issue #49) state the need and its purpose in plain text and leave the "how" to the developer implementing it later.

Then run the cross-tool/app impact review for this candidate by following `develop-feature`'s step exactly (`.claude/skills/develop-feature/SKILL.md`, Phase 2 step 1) — don't duplicate that logic here, so the two skills can't drift out of sync. Read "the issue (issue mode) or provided text (ad-hoc mode)" there as this candidate, and ignore its `cd <worktree-path> &&` dispatch note: this skill creates no worktree, so the `Explore` agent runs against the current checkout. Any questions it produces join this candidate's one-at-a-time dialogue above and are asked before drafting; when it skips silently, so does this step. The answers set this candidate's scope — which related tools/apps it covers, or whether a related one becomes its own separate candidate — they do not become implementation detail written into the drafted issue body, consistent with this phase's rule against drilling into implementation details.

Before drafting, check `gh issue list --state open` for issues that look like likely duplicates or heavy overlap with the candidate. If found, flag it to the developer via `AskUserQuestion` with two genuine options: "Create anyway" (a new, sufficiently distinct issue) and "Skip this one" (the existing issue already covers it).

## Phase 3: Draft and create

If this run is creating a new parent alongside its sub-issues, draft and create the parent candidate first (steps 1-5 below), and note its issue number — every sub-issue candidate needs it in step 4.

For each candidate that passes Phase 2:
1. Draft a title and a plain-text body describing the need and its purpose (no code blocks, no implementation prescriptions), matching the tone of this repo's existing issues.
2. Present the draft to the developer via `AskUserQuestion` with two genuine options: "Create it" and "Revise the draft" (loop back into Phase 2's dialogue for this candidate, then re-draft).
3. Determine the kind label(s) by following `develop-feature`'s ad-hoc-mode kind-label step exactly (`.claude/skills/develop-feature/SKILL.md`, ad-hoc mode step 2) — don't duplicate that logic here, so the two skills can't drift out of sync.
4. Create the issue. If this candidate is a sub-issue (of an existing parent, or of one just created earlier in this run), add `--parent <parent issue number or URL>`:
   ```bash
   gh issue create --title "<title>" --label "<kind label 1>" --label "<kind label 2 if applicable>" --parent <parent issue number> --body "$(cat <<'EOF'
   <body>
   EOF
   )"
   ```
5. Report the created issue's URL to the developer.

If sub-issues are being attached to an existing parent one at a time rather than created fresh (e.g. the developer wants an already-open issue turned into a sub-issue), use `gh issue edit <parent number> --add-sub-issue <existing issue number>` instead of the `--parent` flag on create.

## Non-goals

- No worktree, no branch, no code changes — this skill only produces GitHub issues.
- Does not assign the issue or apply an "in progress" label — that happens later, when `develop-feature` picks the issue up.
