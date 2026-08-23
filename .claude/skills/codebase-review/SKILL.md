---
name: codebase-review
description: Use for an on-demand review of the whole blood-bowl-tracker codebase against the conventions in CLAUDE.md that no ESLint rule enforces, and against documentation quality and correctness under docs/ — fans out one read-only subagent per fixed criterion, confirms the findings with the developer, and files one parent GitHub issue per review pass with a sub-issue per distinct kind of problem found. Produces only issues; by instruction (not a technical sandbox), it is not supposed to change code, docs, or skill files, and never opens a PR.
---

# codebase-review

Reviews the whole repository against a fixed list of criteria — conventions documented in `CLAUDE.md` that today are enforced only by human review, plus documentation quality and correctness under `docs/` — and turns what it finds into GitHub issues: one parent issue per review pass, with one sub-issue per distinct kind of problem found. Every occurrence of the same problem type across the codebase is grouped into that one sub-issue rather than filed per file.

Drift accumulates silently in older code that predates a convention, or in areas a human reviewer doesn't happen to look at closely. This skill surfaces that drift repeatably, without a human having to audit the whole codebase and its docs by hand.

## Invocation

```text
/codebase-review
```

Takes no arguments; always runs the full fixed criteria list below against the whole repo, the same way `/code-hygiene` always runs its full fixed task list. A narrower look can be done by hand — this skill accepts no scoping argument.

## Scope

**In scope:** convention adherence for conventions not already enforced by a dedicated ESLint rule, dependency usage judgment, and documentation quality and correctness, including a whole-picture architecture/structure angle.

**Out of scope:**

- Dependency freshness and dead code removal — `code-hygiene` already owns both.
- Any convention already fully enforced by a dedicated ESLint rule — such as `max-lines`, `local/max-function-params`, `local/no-direct-service-instantiation`, and `local/no-test-helper-imports`. CI already guarantees these, so re-checking them here adds nothing. A criterion below that sits *next to* one of these rules (for example test discipline, next to `local/no-direct-service-instantiation`) covers only the part the rule cannot see.

## Relationship to existing skills

- **No worktree, no branch, no code changes** — the same non-goals as `write-issue`. This skill does **not** follow `develop-feature`'s Setup / Development / Self-review / Integration phases the way `code-hygiene` does, because it produces no commits and no PR. It runs against the current checkout.
- **Phase 3 reuses `write-issue`'s Phase 3 (Draft and create) by reference**, in its new-parent-with-sub-issues mode — read `.claude/skills/write-issue/SKILL.md` and follow that phase, rather than duplicating its steps here, so the two skills can't drift out of sync. This is the same cross-reference pattern `write-issue` itself uses for `develop-feature`'s kind-label step.
- **`write-issue`'s Phase 1 (Enumerate candidates) and Phase 2 (Refine each candidate) are not used.** This skill's own Phase 1 below already produces evidence-backed candidates, so there is nothing to enumerate from a free-form prompt; and `write-issue`'s Phase 2 purpose/scope dialogue and cross-tool impact review don't apply to findings that already carry their own evidence and scope. This skill's own Phase 2 confirmation stands in for `write-issue`'s Phase 1 confirmation — the same way `code-hygiene` skips the `develop-feature` steps that don't apply to fixed, non-conversational work.
- **Kind labels come from `develop-feature`'s ad-hoc-mode step 2**, reached through `write-issue`'s Phase 3 step 3, which already delegates there. Do not duplicate that logic in this file either.

## Phase 1: Review — fan out one subagent per criterion

Dispatch one read-only `Agent` per criterion in the fixed list below, each scanning the **whole** repository for that one criterion. All six criteria are independent, so dispatch them **in parallel — a single message with six `Agent` tool calls** — not one at a time.

### Subagent dispatch

- Use `subagent_type: "Explore"` — a search agent with no `Write`/`Edit` tools, which rules out the two most direct ways it could change a file. It retains `Bash`, so the explicit "must not fix anything, must not edit any file" instruction below is what actually carries the read-only guarantee.
- Resolve the repo root once, before dispatching, and pass it into every prompt:
  ```bash
  git rev-parse --show-toplevel
  ```
- Prefix **every** shell command in every dispatch prompt with `cd <repo-root> &&`. Subagent shell sessions do not reliably persist a working directory across tool calls, per `CLAUDE.md`'s worktree discipline; the same rule applies here even though this skill creates no worktree.
- Tell each agent to search **"very thorough"** breadth — several naming conventions and several directories — since a criterion that only samples one package would under-report drift.
- `Explore` is built to locate code by excerpt, not to audit it — every criterion here is a judgment call over full file content (does this comment cross into narration, does this mock reimplement its collaborator, does this doc still match the code), so tell each agent explicitly to **read each candidate file in full** before judging it, not to decide from a search-result excerpt.
- Each dispatch prompt contains, in this order: the repo root and the `cd` prefix rule; the criterion's own instructions from the fixed list below, quoted in full; a pointer to the specific `CLAUDE.md` section (or `docs/` file) that defines the convention being audited, so the agent reads the authoritative wording rather than working from the summary; the "what does not count" exclusions for that criterion; the read-full-files instruction above; and the finding report format below.
- Tell each agent explicitly that it must **not** fix anything it finds, must not edit any file, and must report findings only.

### Finding report format

A single criterion may yield **more than one** finding when the occurrences differ meaningfully in kind — for example, comment hygiene splitting into "verbose historical narration" and "lingering references to prior code states" as two separate findings. Tell each agent to split on kind, not to force one finding per criterion, and equally not to split one kind into a finding per file.

Each agent returns a list of distinct **problem-type findings**, each with:

- **Title** — a short phrase naming the problem type; becomes the basis of a sub-issue title.
- **Description** — plain text: what the problem is, and why it matters. No implementation prescription.
- **Evidence** — a representative sample of `file:line` locations, plus a **total occurrence count**. For a widespread finding the sample is capped (roughly 5–10 locations) and the count carries the rest; an exhaustive list of hundreds of locations is not wanted.

An agent that finds nothing for its criterion reports an empty finding list. That is a normal outcome, not a failure — say so in the dispatch prompt so an agent doesn't manufacture a marginal finding to avoid returning nothing. **An empty finding list is not the same as full coverage**, so alongside its findings (or lack of them) every agent also reports what it actually checked: for a criterion scoped to a fixed, enumerable file set (criterion 5), the paths it read and any it skipped and why; for a criterion scoped by pattern across the whole repo (the other five), a one-line note on the search breadth actually covered. This is what lets criterion 5's own partial-coverage caveat below be reported honestly rather than reading as a clean pass. Carry this coverage note into the parent issue body in Phase 3.

### Fixed criteria list

1. **Service vs. loose function.** Find loose exported functions in NestJS-enabled packages and apps that don't match one of the four documented exceptions in `CLAUDE.md`'s "Service vs. loose function" section: generic over entity/table type, pure assembly wrapped by a factory service, provider bootstrap function used as a module's `useFactory`, or a framework-agnostic package (`packages/api-contract`, `tools/eslint-rules`). The clearest violation named there — a function that takes an already-injected provider as a parameter and simply calls it — is worth calling out separately if it occurs. Does not count: functions inside `*.spec.ts` / `*.test-helpers.ts`, type-only exports, and anything matching one of the four exceptions.

2. **Test setup and mocking discipline.** Find deviations from `CLAUDE.md`'s "Testing services" section across `*.spec.ts` files: a **real collaborator** passed as a provider instead of a mock; a **mock that reimplements** the collaborator's real logic (computing the right answer) instead of returning canned values; module-level rather than per-test mocks; and a `beforeEach`-vs-per-test-`makeService(...)`-factory choice that doesn't fit the stated criteria for each idiom. Does not count: direct instantiation of a class whose name ends in a suffix `local/no-direct-service-instantiation` covers (`*Service`, `*Parser`, `*Processor`, `*Reader`, `*Middleware`) — the rule already enforces those; direct instantiation of an `@Injectable()` class with a different suffix is exactly the gap `CLAUDE.md` names that rule as not catching, and does count. Also does not count: the three exceptions `CLAUDE.md` names explicitly — `*.module.spec.ts` files compiling the real module graph, a pure dependency-free formatting service passed real, and a formatting service whose only collaborator is itself pure and dependency-free.

3. **Comment hygiene.** Find comments that narrate a feature's implementation history or rationale in detail rather than clarifying a non-obvious "why", and any lingering references to prior code states ("previously X, now Y", "used to…", "after the refactor") or to issue numbers ("issue #123", "see #123"). Covers both code comments and inline commentary in data files. Does not count: a short comment that genuinely explains a non-obvious *why* about the current state; JSDoc describing current behavior; and links to external references such as an upstream bug tracker URL that documents a live workaround.

4. **Dependency usage appropriateness.** Find judgment-level dependency choices that `code-hygiene`'s automated tooling doesn't cover: a hand-rolled utility duplicating a library already used elsewhere in this repo, and a dependency introduced where an existing one already solves the problem. Does not count: dependency freshness or version drift, unused dependencies, and `dependencies`-vs-`devDependencies` placement — all three belong to `code-hygiene`.

5. **Documentation quality and correctness.** Check every `*.md` file under `docs/` (excluding gitignored paths such as `docs/plans/`) on two axes. **Correctness:** staleness against the code it describes — a renamed field, changed behavior, a described module that no longer exists, a rule the code no longer implements. **Readability against `docs/spec-conventions.md`:** a missing one-sentence purpose statement, a wall of text that needs sectioning, a broken or missing cross-reference, and content the conventions say belongs in code rather than a spec. Read `docs/spec-conventions.md` first, then judge against it. This is the widest criterion in the list — full coverage of every file against the current code is not expected in one pass; report what was actually checked so a partial pass reads as partial, not exhaustive.

6. **Architecture/structure.** Read `docs/architecture.md` plus the actual module layout across `apps/`, `packages/`, and `tools/`, and propose restructuring opportunities by asking how this codebase would be structured if it were built fresh today with all current requirements known upfront, rather than having grown incrementally. Look for responsibilities split across packages that would sit together, packages that have accumulated unrelated responsibilities, and duplicated concepts that would be one shared module. Report each opportunity as its own finding with the concrete modules involved — not a single "the architecture could be better" finding. Does not count: file-size or function-length concerns, which ESLint already enforces.

## Phase 2: Merge and confirm

1. **Merge every criterion's findings into one candidate list.** The result is one parent candidate, titled `Codebase review pass — <YYYY-MM-DD>` using today's date, plus one child candidate per distinct problem-type finding.
   - Where two criteria surfaced overlapping findings that point at the same underlying problem — for example the architecture criterion and the dependency criterion both flagging the same module — merge them into a single candidate rather than filing near-duplicate issues, combining their evidence.
   - Keep genuinely distinct problem types separate even when they came from the same criterion.
   - **If every criterion returned an empty finding list, there are no child candidates.** Report a clean pass and **stop** here, before presenting anything — do not construct or offer a lone parent candidate with nothing under it.
2. **Check each child candidate for duplicates**, the same way `write-issue`'s Phase 2 does before drafting: `gh issue list --state open` and flag any candidate that looks like a likely duplicate or heavy overlap with an already-open issue. This matters more here than in `write-issue`, since this skill is meant to be run periodically against a fixed criteria list — without this check, a problem type already filed by a prior pass and not yet fixed would be re-filed under a new parent every run. For each flagged candidate, ask the developer via a separate `AskUserQuestion` with two genuine options: "Create anyway" and "Skip this one" (drop it from the candidate list before step 3) — one question per flagged candidate, not batched, since each names a different existing issue the developer must actually look at to judge overlap. A candidate kept via "Create anyway" is still presented again in step 3's multi-select; that is not a redundant question, since step 3 is where the developer chooses which of the (now duplicate-checked) candidates to actually create.
3. **Present the full candidate list to the developer via `AskUserQuestion` (multi-select)**, following `write-issue`'s Phase 1 confirmation pattern and `CLAUDE.md`'s "Developer prompts" batching rules exactly — read those rather than re-deriving them here. Two things are specific to this skill and not covered by that reference:
   - Each child option's description shows the candidate's title and its evidence count (`<N> occurrences`), so the developer can judge scope before committing to anything. The parent option has no evidence of its own — show the total child count instead (`<N> problem types found`).
   - The parent candidate is one of the options because `write-issue`'s Phase 3 (see below) requires one. Unlike `write-issue`'s own new-parent-with-sub-issues use case, there is no existing issue that could stand in for it here — a fresh review pass always creates its own fresh parent — so deselecting the parent while keeping children is not a supported combination; treat it the same as deselecting everything below.
4. **If no child is confirmed** — whether or not the parent is — report that no issues will be created and **stop**. This is a valid outcome, not an error. A parent with no children is never created: an empty parent issue with nothing to link is not a useful output, so selecting only the parent is treated exactly like selecting nothing.

## Phase 3: Draft and create

Follow `write-issue`'s Phase 3 (Draft and create) — read `.claude/skills/write-issue/SKILL.md` and follow that phase, in its **new-parent-with-sub-issues** mode. Do not restate its steps here. The mapping into it:

- The confirmed candidates from Phase 2 are its candidates; they have already passed confirmation, so there is no Phase 2 of `write-issue` to run for them. If the developer picks "Revise the draft" at `write-issue`'s Phase 3 step 2, re-draft from this candidate's Phase 1 evidence directly — there is no `write-issue` Phase 2 dialogue to loop back into.
- The parent candidate is its to-be-created parent: draft and create it **first**, and note its issue number — every child needs it. Its body states that this is a `codebase-review` pass for today's date, lists the criteria that were run, notes any criterion that reported only partial coverage (for example criterion 5's own partial-coverage caveat, when it applies), and lists the confirmed child candidates' Phase 2 titles this parent will link — the child issues' own final titles aren't drafted until later in this same phase, and may still change at their own "Revise the draft" step.
- Each child candidate's body states the need and its purpose in plain text, with the representative evidence from Phase 1 (sample locations and total count) included as supporting detail — not as an implementation prescription. This matches this repo's existing issue style.
- Its step 3 (kind labels) delegates to `develop-feature`'s ad-hoc-mode step 2. This is process/tooling work, so `development` is the expected label for most or all candidates — but judge each candidate on its own merits through that step rather than applying `development` by default.
- Its step 4 creates each child with `--parent <parent issue number>`.
- Its step 2 ("Create it" / "Revise the draft") runs once per confirmed candidate, so a pass with many confirmed children means confirming the same list twice — once in Phase 2's multi-select, once more per drafted issue. That repetition is inherited from `write-issue` as-is: each draft is new information (the actual title and body) the multi-select didn't show, so it is not a step to skip or batch.

Report every created issue's URL to the developer when done.

## Non-goals

- No worktree, no branch, and no PR — this skill produces GitHub issues only, exactly like `write-issue`. No code, doc, or skill-file change is instructed anywhere in this file, and dispatched agents are told explicitly not to make one (see "Subagent dispatch" above) — but that guarantee is instruction-based, the same as every other read-only review subagent in this repo, not a technical sandbox: nothing here strips `Bash` or otherwise prevents a dispatched agent from writing a file if it disregarded its instructions.
- Does not assign issues or apply an "in progress" label — that happens later, when `develop-feature` picks up a filed sub-issue.
- Does not fix anything it finds, including obviously easy fixes. Triage and prioritisation stay with the developer, via Phase 2's confirmation and the resulting issue queue.
