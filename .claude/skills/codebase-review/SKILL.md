---
name: codebase-review
description: Use for an on-demand review of the whole blood-bowl-tracker codebase against the conventions in CLAUDE.md that no ESLint rule enforces, and against documentation quality and correctness under docs/ — fans out one read-only subagent per fixed criterion, confirms the findings with the developer, and files one parent GitHub issue per review pass with a sub-issue per distinct kind of problem found. Produces only issues; it never changes code, docs, or skill files and never opens a PR.
---

# codebase-review

Reviews the whole repository against a fixed list of criteria — conventions documented in `CLAUDE.md` that today are enforced only by human review, plus documentation quality and correctness under `docs/` — and turns what it finds into GitHub issues: one parent issue per review pass, with one sub-issue per distinct kind of problem found. Every occurrence of the same problem type across the codebase is grouped into that one sub-issue rather than filed per file.

Drift accumulates silently in older code that predates a convention, or in areas a human reviewer doesn't happen to look at closely. This skill surfaces that drift repeatably, without a human having to audit the whole codebase and its docs by hand.

## Invocation

```
/codebase-review
```

Takes no arguments; always runs the full fixed criteria list below against the whole repo, the same way `/code-hygiene` always runs its full fixed task list. A narrower look can be done by hand — this skill accepts no scoping argument.

## Scope

**In scope:** convention adherence for conventions not already enforced by a dedicated ESLint rule, and documentation quality and correctness, including a whole-picture architecture/structure angle.

**Out of scope:**

- Dependency freshness and dead code removal — `code-hygiene` already owns both.
- Any convention already fully enforced by a dedicated ESLint rule — `max-lines`, `local/max-function-params`, and `local/no-direct-service-instantiation`. CI already guarantees these, so re-checking them here adds nothing. A criterion below that sits *next to* one of these rules (for example test discipline, next to `local/no-direct-service-instantiation`) covers only the part the rule cannot see.

## Relationship to existing skills

- **No worktree, no branch, no code changes** — the same non-goals as `write-issue`. This skill does **not** follow `develop-feature`'s Setup / Development / Integration phases the way `code-hygiene` does, because it produces no commits and no PR. It runs against the current checkout.
- **Phase 3 reuses `write-issue`'s Phase 3 (Draft and create) by reference**, in its new-parent-with-sub-issues mode — read `.claude/skills/write-issue/SKILL.md` and follow that phase, rather than duplicating its steps here, so the two skills can't drift out of sync. This is the same cross-reference pattern `write-issue` itself uses for `develop-feature`'s kind-label step.
- **`write-issue`'s Phase 1 (Enumerate candidates) and Phase 2 (Refine each candidate) are not used.** Phase 1 of this skill already produces evidence-backed candidates, so there is nothing to enumerate from a free-form prompt; and Phase 2's purpose/scope dialogue and cross-tool impact review don't apply to findings that already carry their own evidence and scope. This skill's own Phase 2 confirmation stands in for `write-issue`'s Phase 1 confirmation — the same way `code-hygiene` skips the `develop-feature` steps that don't apply to fixed, non-conversational work.
- **Kind labels come from `develop-feature`'s ad-hoc-mode step 2**, reached through `write-issue`'s Phase 3 step 3, which already delegates there. Do not duplicate that logic in this file either.

## Phase 1: Review — fan out one subagent per criterion

Dispatch one read-only `Agent` per criterion in the fixed list below, each scanning the **whole** repository for that one criterion. All six criteria are independent, so dispatch them **in parallel — a single message with six `Agent` tool calls** — not one at a time.

### Subagent dispatch

- Use `subagent_type: "Explore"` — a read-only search agent with no `Write`/`Edit` tools. This skill changes nothing, and an agent that cannot write is the enforcement of that.
- Resolve the repo root once, before dispatching, and pass it into every prompt:
  ```bash
  git rev-parse --show-toplevel
  ```
- Prefix **every** shell command in every dispatch prompt with `cd <repo-root> &&`. Subagent shell sessions do not reliably persist a working directory across tool calls, per `CLAUDE.md`'s worktree discipline; the same rule applies here even though this skill creates no worktree.
- Tell each agent to search **"very thorough"** breadth — several naming conventions and several directories — since a criterion that only samples one package would under-report drift.
- Each dispatch prompt contains, in this order: the repo root and the `cd` prefix rule; the criterion's own instructions from the fixed list below, quoted in full; a pointer to the specific `CLAUDE.md` section (or `docs/` file) that defines the convention being audited, so the agent reads the authoritative wording rather than working from the summary; the "what does not count" exclusions for that criterion; and the finding report format below.
- Tell each agent explicitly that it must **not** fix anything it finds, must not edit any file, and must report findings only.

### Finding report format

A single criterion may yield **more than one** finding when the occurrences differ meaningfully in kind — for example, comment hygiene splitting into "verbose historical narration" and "lingering references to prior code states" as two separate findings. Tell each agent to split on kind, not to force one finding per criterion, and equally not to split one kind into a finding per file.

Each agent returns a list of distinct **problem-type findings**, each with:

- **Title** — a short phrase naming the problem type; becomes the basis of a sub-issue title.
- **Description** — plain text: what the problem is, and why it matters. No implementation prescription.
- **Evidence** — a representative sample of `file:line` locations, plus a **total occurrence count**. For a widespread finding the sample is capped (roughly 5–10 locations) and the count carries the rest; an exhaustive list of hundreds of locations is not wanted.

An agent that finds nothing for its criterion reports an empty finding list. That is a normal outcome, not a failure — say so in the dispatch prompt so an agent doesn't manufacture a marginal finding to avoid returning nothing.

### Fixed criteria list

1. **Service vs. loose function.** Find loose exported functions in NestJS-enabled packages and apps that don't match one of the four documented exceptions in `CLAUDE.md`'s "Service vs. loose function" section: generic over entity/table type, pure assembly wrapped by a factory service, provider bootstrap function used as a module's `useFactory`, or a framework-agnostic package (`packages/api-contract`, `tools/eslint-rules`). The clearest violation named there — a function that takes an already-injected provider as a parameter and simply calls it — is worth calling out separately if it occurs. Does not count: functions inside `*.spec.ts` / `*.test-helpers.ts`, type-only exports, and anything matching one of the four exceptions.

2. **Test setup and mocking discipline.** Find deviations from `CLAUDE.md`'s "Testing services" section across `*.spec.ts` files: a **real collaborator** passed as a provider instead of a mock; a **mock that reimplements** the collaborator's real logic (computing the right answer) instead of returning canned values; module-level rather than per-test mocks; and a `beforeEach`-vs-per-test-`makeService(...)`-factory choice that doesn't fit the stated criteria for each idiom. Does not count: direct instantiation (`new XService(...)`), which `local/no-direct-service-instantiation` already enforces; and the three exceptions `CLAUDE.md` names explicitly — `*.module.spec.ts` files compiling the real module graph, a pure dependency-free formatting service passed real, and a formatting service whose only collaborator is itself pure and dependency-free.

3. **Comment hygiene.** Find comments that narrate a feature's implementation history or rationale in detail rather than clarifying a non-obvious "why", and any lingering references to prior code states ("previously X, now Y", "used to…", "after the refactor") or to issue numbers ("issue #123", "see #123"). Covers both code comments and inline commentary in data files. Does not count: a short comment that genuinely explains a non-obvious *why* about the current state; JSDoc describing current behavior; and links to external references such as an upstream bug tracker URL that documents a live workaround.

4. **Dependency usage appropriateness.** Find judgment-level dependency choices that `code-hygiene`'s automated tooling doesn't cover: a hand-rolled utility duplicating a library already used elsewhere in this repo, and a dependency introduced where an existing one already solves the problem. Does not count: dependency freshness or version drift, unused dependencies, and `dependencies`-vs-`devDependencies` placement — all three belong to `code-hygiene`.

5. **Documentation quality and correctness.** Check every `*.md` file under `docs/` (excluding the gitignored `docs/plans/`) on two axes. **Correctness:** staleness against the code it describes — a renamed field, changed behavior, a described module that no longer exists, a rule the code no longer implements. **Readability against `docs/spec-conventions.md`:** a missing one-sentence purpose statement, a wall of text that needs sectioning, a broken or missing cross-reference, and content the conventions say belongs in code rather than a spec. Read `docs/spec-conventions.md` first, then judge against it.

6. **Architecture/structure.** Read `docs/architecture.md` plus the actual module layout across `apps/`, `packages/`, and `tools/`, and propose restructuring opportunities by asking how this codebase would be structured if it were built fresh today with all current requirements known upfront, rather than having grown incrementally. Look for responsibilities split across packages that would sit together, packages that have accumulated unrelated responsibilities, and duplicated concepts that would be one shared module. Report each opportunity as its own finding with the concrete modules involved — not a single "the architecture could be better" finding. Does not count: file-size or function-length concerns, which ESLint already enforces.

## Phase 2: Merge and confirm

1. **Merge every criterion's findings into one candidate list.** The result is one parent candidate, titled `Codebase review pass — <YYYY-MM-DD>` using today's date, plus one child candidate per distinct problem-type finding.
   - Where two criteria surfaced overlapping findings that point at the same underlying problem — for example the architecture criterion and the dependency criterion both flagging the same module — merge them into a single candidate rather than filing near-duplicate issues, combining their evidence.
   - Keep genuinely distinct problem types separate even when they came from the same criterion.
2. **Present the full candidate list to the developer via `AskUserQuestion` (multi-select)**, following `write-issue`'s Phase 1 confirmation pattern exactly:
   - At most 4 options per question and at most 4 questions per call. Split the candidates across consecutive questions of at most 4 candidates each, in the order presented, **all sent in a single call** — the union of the answers is the confirmed set.
   - Set `multiSelect: true` on **every** split question, not only the first, and word each so it reads as a continuation of one decision.
   - A single call caps out at 16 candidates. If there are more, ask about the first 16 in one call, then ask about the rest in a follow-up call, repeating until every candidate has been offered. Say how many batches there are when asking the first, so the developer knows more is coming.
   - Never invent an option — no "None", "All", "Both", "Neither", or "Skip the rest"; deselecting everything already means none. Never add an explicit free-text or "Chat about this" option; both are provided automatically. See `CLAUDE.md`'s "Developer prompts" section.
   - Each option's description shows the candidate's title and its evidence count (`<N> occurrences`), so the developer can judge scope before committing to anything.
   - The parent candidate is one of the options, per `write-issue`'s new-parent-with-sub-issues shape — in principle the developer can deselect it in favour of an existing issue, though a fresh review pass normally wants a fresh parent.
3. **If nothing is confirmed** — the developer deselects everything — report that no issues will be created and **stop**. This is a valid outcome, not an error.
4. **If child candidates are confirmed but the parent is not**, ask the developer via `AskUserQuestion` which existing issue should be the parent, offering the open issues that plausibly fit as options plus "Create the parent anyway". Carry the answer into Phase 3 as the known parent number.

## Phase 3: Draft and create

Follow `write-issue`'s Phase 3 (Draft and create) — read `.claude/skills/write-issue/SKILL.md` and follow that phase, in its **new-parent-with-sub-issues** mode. Do not restate its steps here. The mapping into it:

- The confirmed candidates from Phase 2 are its candidates; they have already passed confirmation, so there is no Phase 2 of `write-issue` to run for them.
- The parent candidate is its to-be-created parent: draft and create it **first**, and note its issue number — every child needs it.
- Each child candidate's body states the need and its purpose in plain text, with the representative evidence from Phase 1 (sample locations and total count) included as supporting detail — not as an implementation prescription. This matches this repo's existing issue style.
- Its step 3 (kind labels) delegates to `develop-feature`'s ad-hoc-mode step 2. This is process/tooling work, so `development` is the expected label for most or all candidates — but judge each candidate on its own merits through that step rather than applying `development` by default.
- Its step 4 creates each child with `--parent <parent issue number>`.

Report every created issue's URL to the developer when done.

## Non-goals

- No worktree, no branch, no code, doc, or skill-file changes, and no PR — this skill produces GitHub issues only, exactly like `write-issue`.
- Does not assign issues or apply an "in progress" label — that happens later, when `develop-feature` picks up a filed sub-issue.
- Does not fix anything it finds, including obviously easy fixes. Triage and prioritisation stay with the developer, via Phase 2's confirmation and the resulting issue queue.
