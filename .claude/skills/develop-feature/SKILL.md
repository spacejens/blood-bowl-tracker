---
name: develop-feature
description: Use when starting work on a GitHub issue or an ad-hoc feature in the blood-bowl-tracker project — takes an issue number or a text description and guides development from branch creation to a pull request ready for human review
---

# develop-feature

Structured feature development from a GitHub issue or free-form description to a pull request. See [docs/development-workflow.md](../../../docs/development-workflow.md) for the human-readable explanation of this process.

## Invocation

**Issue mode** — provide a GitHub issue number:
```
/develop-feature 42
```

**Ad-hoc mode** — provide a text description of the feature:
```
/develop-feature Add player stats endpoint
```

If the argument is a plain integer, issue mode is used. Any other text triggers ad-hoc mode.

## Phases

Work through each phase in order. Some phase transitions require the developer's explicit approval before continuing — these are marked **Pause** in the phase below, and you must wait for confirmation before proceeding. Other transitions carry no actionable decision for the developer (e.g., confirming a worktree was created, or that automated checks passed) — for these, print a brief status line noting what completed, then continue immediately into the next phase without waiting.

## Subagent dispatch discipline

This applies to every subagent dispatched from any phase below while working in a worktree — the planning subagent in Phase 3, implementer, task reviewer, and fixer subagents in Phase 4, and the self-review subagent in Phase 5. Every shell command in its dispatch prompt must be prefixed with `cd <worktree-path> &&` — do not rely on a one-time "work from `<path>`" instruction. Subagent shell sessions do not reliably persist a starting directory across tool calls, and a dropped `cd` can silently commit to the wrong checkout (e.g. `main` in the primary repo instead of the feature branch). After each subagent reports a commit, verify with `git log --oneline -1` and `git branch --show-current` (run from the worktree) that the commit actually landed on the expected branch before trusting the report.

## Worktree isolation and shell commands

A worktree-isolated session's safety check can refuse to run a shell command it judges too complex to verify stays inside the worktree — even a read-only one that touches no git state. In practice this reliably rejects multi-statement blocks (several commands chained by newlines/`;`, or `if`/loop constructs), and can — inconsistently, session to session — also reject a single heredoc invocation (`cmd <<'EOF' ... EOF`). A `cd <worktree-path> && <single command>` prefix, as required throughout this skill for every subagent dispatch, is accepted.

When a step's logic doesn't reduce to one plain command, put it behind **one** command invocation instead: a subcommand of one of the `tools/*-cli` helper packages (`node tools/<package>/dist/main.js <subcommand> ...` — build it first with `pnpm --filter @blood-bowl-tracker/<package> run build` if `dist/main.js` is missing) or a script file invoked as a single command. This is why Phase 6's review wait is a single `wait-for-pr-review` invocation instead of an inline poll loop. `docs/plans` writes go through the same `write-file` subcommand for a different reason (Phases 2 and 3 below — the Write tool refuses to write through the `docs/plans` symlink), fed via a heredoc; if that heredoc form is refused in a given session, fall back to writing the content to a plain file first and piping it in, e.g. `cat <file> | node tools/fs-utils-cli/dist/main.js write-file <path>`.

---

### Phase 1: Setup

**Detect mode** from the argument:
- No argument → ask the developer to provide an issue number or feature description, then restart Phase 1
- Plain integer (e.g. `42`) → **issue mode**
- Any other text (e.g. `Add player stats endpoint`) → **ad-hoc mode**

**Issue mode:**
1. Fetch the issue:
   ```bash
   gh issue view <N> --json title,body,labels,state,assignees,author,url,comments
   ```
   If the issue does not exist, `gh` will error — report the error and **stop**.
2. Check whether `<N>` is Renovate's Dependency Dashboard — a live status page Renovate rewrites itself, listing pending dependency updates. It is not a piece of work, and branching against it would clobber Renovate's own content. Re-fetch just the fields the check needs, rather than hand-assembling JSON from the step 1 fetch — an issue title containing a quote or apostrophe would otherwise break inline shell interpolation and, because this gate fails closed, wrongly refuse a legitimate issue:

   ```bash
   gh issue view <N> --json number,title,author | node tools/dev-workflow-cli/dist/main.js check-dependency-dashboard
   ```

   Build `tools/dev-workflow-cli` first with `pnpm --filter @blood-bowl-tracker/dev-workflow-cli run build` if `dist/main.js` is missing, matching this skill's convention for its other CLI subcommand calls. This step runs in the main checkout, before any worktree exists (Setup step 8 creates it) — unlike this skill's later `cd <worktree-path> &&`-prefixed invocations, the relative path here is correct as written.

   - If `isDependencyDashboard` is `true`, report "Issue #N is Renovate's Dependency Dashboard — a live status page Renovate rewrites itself, not a piece of work to pick up. Nothing to do." and **stop** — before comments are surfaced, before the PR check, before the state check, before claiming or assigning, before branch naming, and before any worktree work.
   - If the invocation fails because the built artifact predates this subcommand (a `dist/main.js` present but not yet rebuilt after this check was added — its error names `check-dependency-dashboard` as an unrecognized subcommand), rebuild with the same `pnpm --filter` command above and retry once before giving up. A file-existence check alone cannot tell an up-to-date build apart from a stale one left over from before this command existed.
   - If the check itself fails for any other reason (a build failure, a non-zero exit not explained by the retry above, or output carrying no `isDependencyDashboard` field), report the error and **stop**. This is a safety gate, so a broken check fails closed rather than falling through to normal issue handling.
   - If `isDependencyDashboard` is `false`, continue to step 3 exactly as today.

   Detection is by title and author, never by issue number — Renovate can recreate the issue under a new number. Ad-hoc mode has no issue number and so needs no equivalent step.
3. Surface any existing comments so prior investigation notes (e.g. "blocked on issue #X, see findings below") are read before Phase 1 makes any decision. Using the `comments` array from the step 1 fetch:
   - If it is non-empty, print each comment's author and body — one line per comment, e.g. `Existing comments on #N: — @<author>: <body>`.
   - If it is empty, skip silently — print nothing and change no behavior.
   This is informational only: it never gates, pauses, or alters the PR-check / state-check / claim / branch flow that follows.
4. Check whether `<N>` is actually a pull request, not an issue: if the returned `url` contains `/pull/` (issue URLs are `.../issues/<N>`; PR URLs are `.../pull/<N>`), report "Issue #N is a pull request, not an issue. Nothing to do." and **stop** — do not proceed to the state check, assignment, branch naming, or worktree creation.
5. Check the `state` field. If it is not `OPEN`, report "Issue #N is not open (state: `<state>`). Nothing to do." and **stop**.
6. Claim the issue:
   - Determine the current `gh` user:
     ```bash
     gh api user --jq .login
     ```
     If this command fails, report a one-line warning and **continue** — skip the assign/label step but still determine and record the kind label below (it does not depend on the current user), then proceed to step 7 to derive the branch name.
   - If the issue's `assignees` array is non-empty and does not include the current user's login, report "Issue #N is already assigned to `<assignee login(s)>`. Stopping." and **stop** — do not derive a branch name or create a worktree.
   - Otherwise (unassigned, or already assigned to the current user), assign and label it:
     ```bash
     gh issue edit <N> --add-assignee @me
     gh issue edit <N> --add-label "in progress"
     ```
     Run these as two separate commands so a failure in one doesn't mask the other. If either command fails, report a one-line warning (e.g. "Could not assign issue #N to you — continuing anyway: `<gh error output>`") and **continue** — do not stop the workflow over a labeling/assignment failure.
   - Determine the issue's kind label — one or more of `feature`, `bug`, `development` — by applying the tests in the "Issue labels" section of [docs/development-workflow.md](../../../docs/development-workflow.md):
     - If the issue's `labels` (from the step 1 fetch) already includes one or more of these three, use that set as-is and skip straight to recording it below.
     - Otherwise, judge from the issue's title and body which of the three clearly apply. More than one may apply (e.g. a bug fix that's also process tooling) — assign all that clearly do.
     - If it's genuinely unclear which applies, ask the developer to choose via `AskUserQuestion`, offering `feature`, `bug`, and `development` as multi-select options.
     - Apply any newly-determined label(s) with one `gh issue edit <N> --add-label "<name>"` call per label (separate from the "in progress" call above, so a failure in one doesn't mask the other). On failure, report a one-line warning and **continue**, matching the existing assign/label failure handling.
   - Record the final kind-label set (whether reused from the existing labels or newly applied) — Phase 6 reuses it when creating the PR.
7. **Pause** — derive **two** distinct candidate branch slugs of the form `issue-{N}-{kebab-slug}` from the issue title (lowercase, spaces → hyphens, punctuation stripped) and ask the developer to choose one via `AskUserQuestion` (single-select, one question, two options). Present each option as the **full literal branch name that will be created** — the slug with the `worktree-` prefix already applied (`worktree-issue-{N}-{kebab-slug}`). The worktree tooling always applies that prefix and this skill never renames the branch, so what the developer approves here is byte-for-byte what lands on GitHub. If a full name is too long for an option label, put the full literal name in that option's description. Wait for the answer before proceeding; the chosen — or free-text — slug, **without** the `worktree-` prefix, is the confirmed branch name (`<confirmed-name>`) used in step 8.
   - **Option 1** — a full slug that closely follows the issue title.
   - **Option 2** — a shortened or rephrased variant of that same slug.
   - If both heuristics would produce the identical string, vary option 2 further (shorten or rephrase again) so the two options are always genuinely distinct. Never collapse to a single option — `AskUserQuestion` requires at least two.
   - Per this project's `AskUserQuestion` convention (`CLAUDE.md`), do not add an explicit free-text or chat option — both are provided automatically.
   - If the developer supplies a free-text name instead of choosing one of the two options, normalize it to the same form (lowercase kebab-case, punctuation stripped), strip a leading `worktree-` if they included it, and prepend the `issue-{N}-` prefix if missing, before treating it as the confirmed branch name.
   - Example: issue 42 "Add player stats endpoint" → offer `worktree-issue-42-add-player-stats-endpoint` and `worktree-issue-42-player-stats-endpoint`, giving a confirmed branch name of `issue-42-add-player-stats-endpoint` or `issue-42-player-stats-endpoint` respectively
8. **REQUIRED SUB-SKILL:** Use `superpowers:using-git-worktrees` to create an isolated worktree on the confirmed branch name — `EnterWorktree(name: <confirmed-name>)`, where `<confirmed-name>` is the slug confirmed with the developer in step 7 (e.g. `issue-66-development-process-improvements`). The tool always applies a `worktree-` prefix, so the branch it creates is `worktree-<confirmed-name>` (e.g. `worktree-issue-66-development-process-improvements`) — and that is its **permanent** name. **Do not rename it.** `EnterWorktree`/`ExitWorktree` track the branch by its creation-time name, so renaming it breaks `wrap-up`'s branch cleanup and `ExitWorktree`'s merge check; the prefix appearing in the PR's branch name is purely cosmetic and nothing depends on its absence. Every later phase derives the branch name dynamically (`git branch --show-current`, `gh pr view --json headRefName`), so no other step needs adjusting.
9. **Link the plans directory** so specs and plans from Phase 2–3 are saved outside the worktree and survive its removal:
   ```bash
   MAIN_ROOT=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
   if [ "$MAIN_ROOT" != "$(pwd)" ]; then
     mkdir -p "$MAIN_ROOT/docs/plans"
     if [ -e docs/plans ]; then
       echo "Warning: docs/plans already exists in the worktree; leaving it as-is instead of symlinking to $MAIN_ROOT/docs/plans"
     else
       ln -s "$MAIN_ROOT/docs/plans" docs/plans
     fi
   fi
   ```
   If no worktree was created (the developer declined worktree creation in Step 0 of `using-git-worktrees`), `MAIN_ROOT` already equals the current directory and this step is a no-op.
10. Install dependencies and build the whole application so later tasks don't fail due to an unbuilt workspace dependency, and so `tools/fs-utils-cli` (which step 11 invokes) exists as compiled output. `superpowers:using-git-worktrees`'s own generic project-setup step runs plain `npm install`, which is wrong for this pnpm workspace — always (re-)install with pnpm here rather than relying on that step:
   ```bash
   pnpm install
   pnpm build
   ```
   If either command fails, report the failure and stop — do not proceed into Phase 2 with a broken baseline.
11. **Sync gitignored worktree files** so later phases can touch BBL/TP data and config-dependent tooling without hitting "file not found" — a fresh worktree lacks the gitignored config files and data directories the main checkout has. Run:
   ```bash
   node tools/fs-utils-cli/dist/main.js sync-gitignored
   ```
   The canonical file and directory lists live in `tools/cli-shared/src/gitignored-files.ts` — add a new tool's config there, not here. The command only fills in what is missing; it never overwrites a file or symlink already present (a developer may have deliberately set one up differently), and it is a no-op outside a worktree. The large `tools/import-bbl/data` and `tools/import-tp/data` directories are symlinked rather than copied — same rationale as the `docs/plans` link in step 9. `tools/review-match` needs no `data/` symlink of its own — its config points at `tools/import-bbl/data` and `tools/import-tp/data`. `deploy-local` runs the same command as a fallback for worktrees this skill did not create; because it is idempotent, that later pass is a no-op when this one already ran.

   It prints JSON to stdout, e.g.:
   ```json
   {
     "copied": ["apps/discord-bot/.env"],
     "symlinked": ["tools/import-bbl/data"],
     "skipped": ["tools/review-match/review-match-config.json5"]
   }
   ```
   `skipped` covers both "already present in the worktree" and "absent from the main checkout too" — neither is an error, so report the counts in step 12's status line and continue. If the command exits non-zero it prints `{"error": "<message>"}` on stderr; report that and stop.
12. Print a brief status line confirming the worktree path, build result, and baseline test result, then continue immediately into Phase 2.

**Ad-hoc mode:**
1. Use the provided text as the feature description
2. Determine the kind label — one or more of `feature`, `bug`, `development` — by judging from the provided text which clearly apply, applying the tests in the "Issue labels" section of [docs/development-workflow.md](../../../docs/development-workflow.md). More than one may apply; assign all that clearly do. If it's genuinely unclear even after applying those tests, ask the developer to choose via `AskUserQuestion`, offering `feature`, `bug`, and `development` as multi-select options. Record the result — Phase 6 uses it when creating the PR. Nothing is applied to GitHub yet, since there is no issue or PR to attach a label to until Phase 6.
3. **Pause** — derive **two** distinct candidate branch slugs of the form `feature-{kebab-slug}` from the provided text (lowercase, spaces → hyphens, punctuation stripped) and ask the developer to choose one via `AskUserQuestion` (single-select, one question, two options). Present each option as the **full literal branch name that will be created** — the slug with the `worktree-` prefix already applied (`worktree-feature-{kebab-slug}`). The worktree tooling always applies that prefix and this skill never renames the branch, so what the developer approves here is byte-for-byte what lands on GitHub. If a full name is too long for an option label, put the full literal name in that option's description. Wait for the answer before proceeding; the chosen — or free-text — slug, **without** the `worktree-` prefix, is the confirmed branch name (`<confirmed-name>`) used in step 4.
   - **Option 1** — a full slug that closely follows the provided description.
   - **Option 2** — a shortened or rephrased variant of that same slug.
   - If both heuristics would produce the identical string, vary option 2 further (shorten or rephrase again) so the two options are always genuinely distinct. Never collapse to a single option — `AskUserQuestion` requires at least two.
   - Per this project's `AskUserQuestion` convention (`CLAUDE.md`), do not add an explicit free-text or chat option — both are provided automatically.
   - If the developer supplies a free-text name instead of choosing one of the two options, normalize it to the same form (lowercase kebab-case, punctuation stripped), strip a leading `worktree-` if they included it, and prepend the `feature-` prefix if missing, before treating it as the confirmed branch name.
   - Example: "Add player stats endpoint" → offer `worktree-feature-add-player-stats-endpoint` and `worktree-feature-player-stats-endpoint`, giving a confirmed branch name of `feature-add-player-stats-endpoint` or `feature-player-stats-endpoint` respectively
4. **REQUIRED SUB-SKILL:** Use `superpowers:using-git-worktrees` to create an isolated worktree on the confirmed branch name — `EnterWorktree(name: <confirmed-name>)`, where `<confirmed-name>` is the slug confirmed with the developer in step 3 (e.g. `feature-add-player-stats-endpoint`). The tool always applies a `worktree-` prefix, so the branch it creates is `worktree-<confirmed-name>` (e.g. `worktree-feature-add-player-stats-endpoint`) — and that is its **permanent** name. **Do not rename it.** `EnterWorktree`/`ExitWorktree` track the branch by its creation-time name, so renaming it breaks `wrap-up`'s branch cleanup and `ExitWorktree`'s merge check; the prefix appearing in the PR's branch name is purely cosmetic and nothing depends on its absence. Every later phase derives the branch name dynamically (`git branch --show-current`, `gh pr view --json headRefName`), so no other step needs adjusting.
5. **Link the plans directory** so specs and plans from Phase 2–3 are saved outside the worktree and survive its removal:
   ```bash
   MAIN_ROOT=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
   if [ "$MAIN_ROOT" != "$(pwd)" ]; then
     mkdir -p "$MAIN_ROOT/docs/plans"
     if [ -e docs/plans ]; then
       echo "Warning: docs/plans already exists in the worktree; leaving it as-is instead of symlinking to $MAIN_ROOT/docs/plans"
     else
       ln -s "$MAIN_ROOT/docs/plans" docs/plans
     fi
   fi
   ```
   If no worktree was created (the developer declined worktree creation in Step 0 of `using-git-worktrees`), `MAIN_ROOT` already equals the current directory and this step is a no-op.
6. Install dependencies and build the whole application so later tasks don't fail due to an unbuilt workspace dependency, and so `tools/fs-utils-cli` (which step 7 invokes) exists as compiled output. `superpowers:using-git-worktrees`'s own generic project-setup step runs plain `npm install`, which is wrong for this pnpm workspace — always (re-)install with pnpm here rather than relying on that step:
   ```bash
   pnpm install
   pnpm build
   ```
   If either command fails, report the failure and stop — do not proceed into Phase 2 with a broken baseline.
7. **Sync gitignored worktree files** so later phases can touch BBL/TP data and config-dependent tooling without hitting "file not found" — a fresh worktree lacks the gitignored config files and data directories the main checkout has. Run:
   ```bash
   node tools/fs-utils-cli/dist/main.js sync-gitignored
   ```
   The canonical file and directory lists live in `tools/cli-shared/src/gitignored-files.ts` — add a new tool's config there, not here. The command only fills in what is missing; it never overwrites a file or symlink already present (a developer may have deliberately set one up differently), and it is a no-op outside a worktree. The large `tools/import-bbl/data` and `tools/import-tp/data` directories are symlinked rather than copied — same rationale as the `docs/plans` link in step 5. `tools/review-match` needs no `data/` symlink of its own — its config points at `tools/import-bbl/data` and `tools/import-tp/data`. `deploy-local` runs the same command as a fallback for worktrees this skill did not create; because it is idempotent, that later pass is a no-op when this one already ran.

   It prints JSON to stdout, e.g.:
   ```json
   {
     "copied": ["apps/discord-bot/.env"],
     "symlinked": ["tools/import-bbl/data"],
     "skipped": ["tools/review-match/review-match-config.json5"]
   }
   ```
   `skipped` covers both "already present in the worktree" and "absent from the main checkout too" — neither is an error, so report the counts in step 8's status line and continue. If the command exits non-zero it prints `{"error": "<message>"}` on stderr; report that and stop.
8. Print a brief status line confirming the worktree path, build result, and baseline test result, then continue immediately into Phase 2.

---

### Phase 2: Specification

1. **Cross-tool/app impact review.** A change rarely stops at the tool or app the issue names: a downloader change alters what its importer can import, a change to one importer usually wants a matching change in its sibling, and newly imported data is something a consuming app or tool could surface. Run this before brainstorming, so the answers are context the spec starts from rather than something it has to rediscover.
   - Identify which tool(s)/app(s) the issue (issue mode) or provided text (ad-hoc mode) names or clearly involves.
   - Look each one up in the "Tool/app relationships" section of `docs/architecture.md`. If none of them appear there, or the ones that do name no related tools/apps worth investigating for this change, **skip the rest of this step silently** — no prompt, no status line, no mention in the spec.
   - For each related tool/app found, dispatch a read-only `Explore` agent scoped to that one tool/app — not the whole repo — to report concrete specifics relevant to this issue: what it does today, what data it already has, and what is missing relative to what this issue would change. Per the "Subagent dispatch discipline" section above, prefix every shell command in its dispatch prompt with `cd <worktree-path> &&`.
   - Turn those findings into specific questions and ask them via `AskUserQuestion` — e.g. "The same match results are also available in TP data. Import them there too?" or "How should the new match results be shown in review-match?". Ask only about findings that genuinely warrant a decision; drop a finding that turns out to be a non-issue (the sibling importer already behaves the same way) rather than manufacturing a question for every related tool/app found. A question that cannot name the specific tool and the specific behavior is not ready to be asked — never fall back to a generic "should this be broader in scope?". Per this project's `AskUserQuestion` convention (`CLAUDE.md`), do not add an explicit free-text or chat option — both are provided automatically.
   - Carry the answers into step 2 as part of the starting context.
2. **REQUIRED SUB-SKILL:** Use `superpowers:brainstorming` with the issue content (issue mode) or provided text (ad-hoc mode) — plus any answers from step 1 — as starting context
3. **Override the brainstorming skill's default spec save location, and save the spec with the `write-file` CLI:** save the spec to `docs/plans/` (gitignored), not `docs/superpowers/specs/`. **Do not use the Write tool for this** — in a worktree, `docs/plans` is a symlink to the main checkout, and the Write tool refuses to write through it (it looks like escaping the worktree) and errors instead. Write the spec by piping it into the `write-file` subcommand:

   ```bash
   cd <worktree-path> && node tools/fs-utils-cli/dist/main.js write-file docs/plans/<spec-filename>.md <<'SPECEOF'
   ...full spec markdown...
   SPECEOF
   ```

   It prints `{"written": "...", "bytes": N}` on success. If `dist/main.js` is missing, build it first with `pnpm --filter @blood-bowl-tracker/fs-utils-cli run build`. Note the exact saved filename — Phase 3 needs it. Then verify the save actually went through: run `test -s "<worktree-path>/docs/plans/<spec-filename>.md"` (checks the file exists AND is non-empty). If that check fails, the save did not go through — do not proceed to the next step as if it succeeded; investigate and re-save instead.
4. **Pause** — ask the developer to review the written spec via `AskUserQuestion`, offering two genuine options: "Approve, move to planning" (proceed to Phase 3) and "Revise the spec" (return to `superpowers:brainstorming` to make changes, then ask again). Per this project's `AskUserQuestion` convention (`CLAUDE.md`), do not add an explicit free-text or chat option — both are provided automatically.

---

### Phase 3: Planning

1. Dispatch a foreground `Agent` call (`model: "opus"`, `run_in_background: false` — Phase 4 depends on its output) to run `superpowers:writing-plans` against the approved spec. Every shell command in its dispatch prompt must be prefixed with `cd <worktree-path> &&`, per the "Subagent dispatch discipline" section above. The dispatch prompt must tell the agent to:
   - Read the approved spec at `docs/plans/<spec-filename>.md` (pass the exact filename from Phase 2)
   - Follow `superpowers:writing-plans`, saving the plan to `docs/plans/` (gitignored) instead of that skill's own default location. Tell the agent explicitly **not to use its Write tool** for that save — `docs/plans` is a symlink to the main checkout and the Write tool refuses to write through it — and to use the `write-file` subcommand instead:

     ```bash
     cd <worktree-path> && node tools/fs-utils-cli/dist/main.js write-file docs/plans/<plan-filename>.md <<'PLANEOF'
     ...full plan markdown...
     PLANEOF
     ```
   - Skip its "Execution Handoff" question — this workflow always uses `subagent-driven-development` (see Phase 4) — and report back only the saved plan's filename
   Planning is delegated to Opus (rather than Phase 2's brainstorming, which stays inline) because it's a bounded, non-interactive task — turning an already-approved spec into a plan file — while brainstorming needs live back-and-forth with the developer that a dispatched subagent handles poorly. This targets the extra reasoning power at one focused step without spending it on the token-heavy implementation phase.
2. After the agent reports its saved plan filename, verify the file exists at that path in the worktree and is non-empty before continuing (`test -s "<worktree-path>/docs/plans/<filename>.md"`) — do not trust the report alone. A `git status` check would not work here: `docs/plans` is gitignored and symlinked to the main checkout, so git reports nothing for it either way.
3. Print a brief status line confirming the plan is written and saved, then continue immediately into Phase 4. The plan is too detailed for a human to usefully approve line-by-line, and the spec approved at the end of Phase 2 already covers the requirements decision — the PR opened in Phase 6 is the review point for the resulting implementation.

---

### Phase 4: Development

1. **REQUIRED SUB-SKILL:** Use `superpowers:subagent-driven-development` to execute the plan. This is the only execution approach used in this workflow — do not ask the developer to choose between this and any alternative (e.g. `executing-plans`); proceed directly into subagent-driven-development. **Stop short of that skill's own terminal steps**: once all tasks are marked complete in its process, do not run its final whole-branch code review, and do not hand off to `superpowers:finishing-a-development-branch`. Both are superseded by this workflow's own Phase 5 (self-review) and Phase 6 (PR creation) — running them here would review the same diff twice and present a merge/PR/keep/discard menu that conflicts with Phase 6's PR creation.
2. For **each task** in the plan, follow this order:
   - **Docs first:** If the task introduces a new concept or constraint, update or create the relevant spec under `docs/` following `docs/spec-conventions.md`
   - **Test first:** Write the failing test — **REQUIRED SUB-SKILL:** Use `superpowers:test-driven-development`. Cover the new branches and edge cases the task introduces (error paths, not-found/empty results, boundary values), not just the happy path — every package enforces a 90% coverage threshold as part of `pnpm test`/`pnpm verify`, so a happy-path-only test now means a second round of test-writing later just to clear the gate.
   - **Implement:** Write code until tests pass
   - **Docs and deployment sync:** If the change just implemented makes any existing file under `docs/` stale (a renamed field, changed behavior, a new module worth mentioning), update it now, without waiting to be asked — keep the update brief, per `docs/spec-conventions.md`. Likewise, if the change affects what `Dockerfile` or `docker-compose.yml` need to know (a new workspace package required at runtime, a changed port or env var, a new migrations path), update those files too.
   - **Commit:** One commit per completed task; message explains what changed and why
3. If tests fail unexpectedly: **REQUIRED SUB-SKILL:** Use `superpowers:systematic-debugging` before proposing fixes
4. Before marking each task done: **REQUIRED SUB-SKILL:** Use `superpowers:verification-before-completion`
5. After each task: check whether the task's diff touches any file under `apps/`, `packages/`, or `tools/` (`git diff --name-only <task-base-sha>..HEAD`, where `<task-base-sha>` is the commit recorded before dispatching that task's implementer). If it does, run `pnpm verify` from the repo root to confirm no regressions (build, lint, typecheck, format, test) — when lint or formatting checks fail, run `pnpm lint:fix` and/or `pnpm format:fix` first; only hand-edit failures those commands can't auto-resolve. If the diff touches only files outside those three directories (e.g. `.claude/`, `docs/`), skip `pnpm verify` and note in the task's status line that it was skipped and why — none of `pnpm verify`'s scripts (`build`, `lint`, `typecheck`, `format`, `test`) run against paths outside `apps/`, `packages/`, `tools/`, so there is nothing for them to check.
6. Print a brief status line confirming all tasks are complete and that `pnpm verify` is green for every task that ran it (noting any tasks that skipped it per step 5), then continue immediately into Phase 5.

---

### Phase 5: Self-review

1. **REQUIRED SUB-SKILL:** Use `superpowers:requesting-code-review` across all changes on the branch
2. Findings come back classified as Critical, Important, or Minor — reuse that classification as-is rather than inventing a new one. Critical and Important findings must be fixed before the loop can exit; Minor findings may be fixed here like any other finding, but are not required to be — step 4 drives whatever is left of them to a resolution. Fix what this step requires (and any Minor findings worth fixing too), then re-run `pnpm verify` to confirm the fixes hold.
3. Repeat steps 1–2 until the review is **clean** — defined as no unresolved Critical or Important findings, and all tests passing. Findings dismissed as false positives are never carried forward.
4. **Resolve the remaining Minor findings.** This step runs **once**, after step 3's loop has exited clean — not per iteration. Take every Minor finding still present in that final iteration and put each into exactly one of three outcomes. Default to **Fix** for anything that is not clearly a Drop or a genuine multi-approach Question:
   - **Fix** — the finding is worth doing. Implement it now. Scope creep beyond the original task is acceptable here: the goal is a clean PR, not a narrowly-scoped diff.
   - **Drop** — the finding is incorrect, or is already covered by separately tracked or planned work. No record is kept, no PR comment is posted, and it is not raised again.
   - **Question** — there is genuinely more than one reasonable fix and you cannot determine which the developer would prefer. Record it in the **pending-questions list** carried forward to Phase 6. Each entry keeps the repo-relative file path and the line number; its body is a question you draft that names the actual options under consideration — not the raw finding text restated as an unaddressed issue.

   A Minor finding is never left as-is: every one ends as a Fix, a Drop, or a Question. Apply every Fix first, then re-check each recorded Question's file and line against the post-Fix state — a Fix earlier in the same file can shift the Question's original line number, and Phase 6 posts whatever location is recorded here without re-deriving it. Update any Question whose location moved before continuing. After classifying and re-checking Question locations, run `pnpm verify` **once** for the whole batch of Fix changes made in this step and commit them; if nothing was classified Fix, skip both. If every Fix change touches only files outside `apps/`, `packages/`, and `tools/` (e.g. `.claude/`, `docs/`), skip `pnpm verify` and note why, per Phase 4 step 5's same rule.
5. Print a brief status line — iterations run, that the review is clean by step 3's definition, and how many Minor findings were fixed, dropped, and carried forward as pending questions (the pending-questions list may be empty; that remains the normal case) — then continue immediately into Phase 6, carrying the pending-questions list forward.

---

### Phase 6: Integration

1. **Sync with `main`.** Bring the branch up to date with `main` before pushing (merge, never rebase — see `CLAUDE.md` "Keeping a branch in sync with main"). This runs once here, right before the push — not per-commit, and not gated on first checking whether `main` moved (merging an up-to-date `main` is a harmless no-op).
   ```bash
   git fetch origin main
   git merge origin/main
   ```
   - **Clean merge** (no conflicts): run `pnpm verify` from the repo root. If it fails, fix the regression the merge introduced, commit, and continue. If it passes, continue directly.
   - **Conflict:** attempt an automated resolution — read both sides of each conflicting hunk, resolve, then run `pnpm verify`. If the correct resolution isn't clear from the diffs, or `pnpm verify` doesn't come back clean afterward, **stop**, report the conflicting files, and wait for the developer to resolve manually before continuing.
2. **Pre-push check — no stray work in the main checkout.** Before `gh pr create` pushes the branch, verify nothing was accidentally left in the **main checkout** (the repo's primary working tree, distinct from this worktree) — the usual cause is a subagent dropping its `cd <worktree>` prefix and editing/committing against `main`.
   ```bash
   node tools/dev-workflow-cli/dist/main.js check-main-stray
   ```
   This prints JSON. If it prints `{"isWorktree": false}`, work is happening in place — **skip the rest of this step**. Otherwise it prints:
   ```json
   {
     "isWorktree": true,
     "uncommittedFiles": [{ "status": " M", "path": "path/to/file" }],
     "strayCommits": [{ "sha": "abc1234", "subject": "commit subject" }]
   }
   ```
   `status` is the raw 2-character `git status --porcelain` code (e.g. `" M"`, `"??"`, `"A "`) — needed below to tell a restorable edit apart from an untracked file. If both arrays are empty, there is nothing stray — continue to step 3. Run this via the CLI rather than `git -C "$MAIN_ROOT" ...` directly: the harness blocks a worktree-isolated session from running git against another checkout, even read-only, so the inline form this replaces could not actually execute here.
   - For each stray item, decide whether it is **already part of this worktree's work**:
     - **Uncommitted edit on main** (an entry in `uncommittedFiles`) — the same content is already committed on the worktree branch (restoring the file on main would lose nothing). Compare the main checkout's working-tree content for the affected paths against the worktree branch's committed content.
     - **Committed on main** (an entry in `strayCommits`) — the commit's patch is already present on the worktree branch (cherry-pick-equivalent — `git cherry` / patch-id match, or the identical diff already committed here).
   - Act on each item. Cleanup runs against the main checkout, so first resolve its path:
     ```bash
     node tools/dev-workflow-cli/dist/main.js resolve-main-root
     ```
     and use the printed `mainRoot` value as `<main-root>` below.
     - **Already in the worktree** → safe to clean up on main automatically. For an `uncommittedFiles` entry whose `status` starts with `?` (untracked — `git restore`/`checkout --` is a no-op on these), delete it directly: `rm "<main-root>/<path>"`. For every other status code, use `git -C "<main-root>" restore <paths>` (or `git -C "<main-root>" checkout -- <paths>`); reset the redundant stray commits the same way. Report what was cleaned. If the `git -C "<main-root>" ...` command itself is refused by the harness (worktree isolation), do not silently skip cleanup — print the exact command to the developer and ask them to run it themselves, e.g. by typing `! <command>` in their prompt (which runs it in their own session and returns its output into the conversation).
     - **Provenance unclear** (not found in the worktree) → **never auto-discard**. Surface the paths / commit summaries and ask the developer via `AskUserQuestion` how to proceed — the change may be their own unrelated work.
3. Create the PR using the appropriate command for the active mode:

   **Issue mode:**
   ```bash
   gh pr create \
     --title "<issue title>" \
     --label "<kind label 1>" \
     --label "<kind label 2 if applicable>" \
     --assignee @me \
     --body "$(cat <<'EOF'
   Closes #<N>

   ## Summary
   <summary of what was built>
   EOF
   )"
   ```
   Use the kind label(s) recorded in Phase 1 step 6 — one `--label` flag per label. The `Closes #<N>` keyword is what links and later closes the issue — no separate action is needed here. When this PR is merged into the repository's default branch, GitHub automatically closes issue #N. The "in progress" label applied in Phase 1 is left in place; it is not removed on close.

   **Ad-hoc mode** — PR title is the human-readable form of the confirmed slug (e.g. `feature-add-player-stats-endpoint` → "Add player stats endpoint"):
   ```bash
   gh pr create \
     --title "<human-readable slug>" \
     --label "<kind label 1>" \
     --label "<kind label 2 if applicable>" \
     --assignee @me \
     --body "$(cat <<'EOF'
   ## Summary
   <summary of what was built>
   EOF
   )"
   ```
   Use the kind label(s) recorded in Phase 1 step 2 — one `--label` flag per label.

   **If `gh pr create` fails** (for any reason — a bad label, a network error, or an assignee failure), report the command's error output to the developer, then ask via `AskUserQuestion` — offering two genuine options:
   - **Retry** — re-run the identical `gh pr create` command. If it fails again, repeat this same handling (report the error, then ask again).
   - **Stop** — halt the skill. The branch is already pushed, but no PR exists yet.

   Per this project's `AskUserQuestion` convention (`CLAUDE.md`), do not add an explicit free-text or chat option — both are provided automatically. This handling is generic to `gh pr create`; an assignee failure is just one of the ways the command can fail, and all of them are handled the same way.

4. **Post pending self-review questions, if any.** Phase 5 carries forward a pending-questions list — the questions it drafted for Minor findings where more than one reasonable fix existed. If that list is empty, **skip this step entirely and silently** — no status line, no PR activity; this is the common case.

   Otherwise, build a JSON array from the list, one object per question: `file` (repo-relative path), `line` (integer), and `body` (the question text exactly as Phase 5 drafted it — **do not** prepend the `**Comment by Claude**` tag here; the subcommand applies it itself).

   Post them with a single command, in the same heredoc-stdin form this skill already uses for `write-file` in Phases 2 and 3 (see "Worktree isolation and shell commands" above for why this must be one command, and its two fallbacks: build `tools/dev-workflow-cli` first if `dist/main.js` is missing, and if the heredoc form is refused in a given session, write the JSON to a plain file first and feed that file into the same command instead):
   ```bash
   cd <worktree-path> && node tools/dev-workflow-cli/dist/main.js post-review-questions <PR> <<'QUESTIONSEOF'
   [
     { "file": "path/to/file.ts", "line": 42, "body": "..." }
   ]
   QUESTIONSEOF
   ```
   Substitute `<PR>` with the PR number from step 3.

   The command prints one JSON object — a `posted` array (each entry's `mode` is `inline` or `top-level`) and a `failed` array (each entry has `file`, `line`, `error`). Report a brief status line from it: how many questions were posted inline, how many as top-level comments, and how many failed — naming each failed question's file, line, and error, so the developer can post it by hand if they care.

   **Warn and continue on failure.** A non-zero exit, unparseable output, or any entries in the `failed` array is a one-line warning, never a stop and never a Pause — matching this phase's existing best-effort precedent (step 2's stray-cleanup warning when the harness refuses a cleanup command). This step is supplementary; the PR already exists regardless of whether these comments post.

   Then continue into the automated review loop below unchanged.

   **Why `handle-pr-reviews` needs no change for this.** Every comment this step posts starts with `**Comment by Claude**`, the same tag every Claude-authored comment in this workflow carries. `handle-pr-reviews`'s existing discovery rule already treats an unresolved thread whose last comment starts with that tag as handled — so these threads are invisible to its unhandled scan from the moment they are posted. If the developer replies, the last comment no longer carries the tag and the thread becomes discoverable and is triaged normally; if the developer resolves it instead, it is excluded as resolved. Both are existing, unmodified `handle-pr-reviews` behavior, which is why no change to that skill is needed or wanted here.

5. **Automated review loop.** An automated review bot reviews every PR in this repo (see `docs/development-workflow.md`). Wait for its review and drive it to completion here rather than leaving it for the developer to notice later. Repeat the wait → handle cycle below for at most **10 iterations total**.

   **Before the loop**, capture the developer's own login once — it is what distinguishes a reviewer from the PR's author:
   ```bash
   gh api user --jq .login
   ```
   If this command fails, skip the loop entirely (report a one-line warning that the review loop was skipped because the current `gh` user could not be determined) and continue to step 6 — without a login there is no way to tell a bot's review apart from the developer's own.

   **Each iteration:**

   a. **Wait for a review.** The threshold for "new" reviews is a watermark carried across iterations, not a freshly captured timestamp each time — see why below.
      - **First iteration only:** immediately before waiting, use the PR's own creation time — as recorded by GitHub — as the watermark, not a freshly captured wall-clock timestamp. CodeRabbit reacts to the PR-created webhook almost instantly and can post its rate-limit comment before a `date +%s` captured after `gh pr create` returns; anchoring to `createdAt` closes that race because GitHub fixes it at PR-creation time, before any webhook response can occur. There is no previous review yet, so there is no id to exclude:
        ```bash
        cd <worktree-path> && gh pr view <PR> --json createdAt --jq .createdAt
        ```
        Then convert to epoch seconds, the same way later iterations convert their own source timestamp:
        ```bash
        cd <worktree-path> && node -e "console.log(Math.floor(new Date('<createdAt>').getTime() / 1000))"
        ```
        Substitute `<createdAt>` with the exact ISO-8601 value returned by the `gh pr view` call, and `<PR>` with the PR number from step 3.
      - **Every later iteration:** reuse the `submittedAt` of the review found and handled in the previous iteration's step (c) — converted to epoch seconds — as this iteration's watermark, and also carry forward its `id` to exclude:
        ```bash
        cd <worktree-path> && node -e "console.log(Math.floor(new Date('<submittedAt>').getTime() / 1000))"
        ```
        Substitute `<submittedAt>` with the exact ISO-8601 value from the previous iteration's found `review.submittedAt`. Keep the previous iteration's `review.id` too — it becomes `<exclude-review-id>` below. This applies to every later iteration regardless of what the previous iteration's `handle-pr-reviews` run reported — including the still-in-progress report below: step (a)'s wait (or a (b)/(b2)/(b3) retry of it) already found and recorded a review before that iteration ever reached (c), so there is always a `submittedAt`/`id` to advance to.

      Then wait for a submitted review by someone other than the developer, posted at or after that watermark, with a single command:
      ```bash
      cd <worktree-path> && node tools/dev-workflow-cli/dist/main.js wait-for-pr-review <PR> <developer-login> <watermark-epoch> --exclude-review-id=<previous-review-id>
      ```
      Substitute the PR number from step 3, the login captured before the loop, and the watermark epoch and previous review id from above. Omit `--exclude-review-id` entirely on the first iteration (nothing to exclude yet). The command polls internally every 30 seconds for up to 20 minutes and stays silent until it exits; if `dist/main.js` is missing, build it first with `cd <worktree-path> && pnpm --filter @blood-bowl-tracker/dev-workflow-cli run build`. It prints one JSON object:
      - `{"found": true, "review": {...}}` — a qualifying review exists. Record both `review.submittedAt` and `review.id` for the next iteration, stop waiting, and go to (c).
      - `{"found": false, "rateLimited": true, "rateLimitComment": {...}}` — CodeRabbit answered with a rate-limit warning comment instead of a review, so the wait returned early rather than running out its remaining time. The result may also carry `availableAtEpochSeconds`, a best-effort epoch parsed from the comment. Go to (b2).
      - `{"found": false, "commentUpdateFailed": true, "commentUpdateFailedComment": {...}}` — CodeRabbit failed to persist an update to its rolling walkthrough comment and posted a failure notice as a separate top-level comment instead, submitting no review, so the wait returned early rather than running out its remaining time. Unlike the rate-limit case there is no wait time to parse. Go to (b3).
      - `{"found": false, "timedOut": true}` — the 20 minutes elapsed with nothing. Go to (b).

      Run it via `Bash` with `run_in_background: true` — this command produces exactly one result at exit, which is what `run_in_background` is for; a foreground `Bash` call would race the wait's own 20-minute budget against `Bash`'s own 10-minute cap, and `Monitor`'s default `timeout_ms` is only 5 minutes (its max is 60 minutes, but only if raised explicitly), so an unmodified `Monitor` call would be killed before the wait can report its own timeout.

      > ⚠️ **Do not use `ScheduleWakeup` for this wait** — it only works inside an active `/loop` session and errors otherwise.

      Because this is a single command, worktree isolation accepts it — unlike the inline multi-line poll loop it replaces, which a worktree-isolated session refuses to run (see "Worktree isolation and shell commands" above). Backgrounding the command means it does not block — wait for the harness's own completion notification for that background task, then read the printed JSON result (from the notification, or the task's output file) as the outcome to branch on in (b)/(c) below; do not try to poll or inspect it before that notification arrives.

      **Why a carried-forward watermark, not a freshly captured timestamp:** capturing `date +%s` at the top of each iteration has a blind spot in both directions. Capture it *before* handing off to `handle-pr-reviews`, and a bot's re-review submitted while that call is still running predates the epoch and is never seen by any later wait. Capture it *after* `handle-pr-reviews` and `deploy-local` return instead (this section's earlier approach), and the opposite gap opens: a re-review submitted *during* that same processing window now predates the freshly-captured epoch too, for the same reason — it already happened before "now". Either way, any review landing in that processing window falls between the wait that already exited (having found the previous review) and the threshold the next wait applies. Anchoring the watermark to the last *handled* review's own `submittedAt` — rather than to whenever the loop happens to resume polling — closes the gap: any review submitted after it, even one landing mid-processing, has a later `submittedAt` and is still picked up by the next wait. This can occasionally re-find a review that `handle-pr-reviews` already handled during the previous iteration's processing window — harmless: that call reports nothing unhandled, and exit check (d) below leaves the loop on exactly that signal, costing at most one iteration.

      **Why `--exclude-review-id`, not just the watermark:** `wait-for-pr-review`'s threshold is inclusive (`submittedAt >= watermark`), not strict — the watermark only has second precision, so a strict `>` would silently exclude a *different* review submitted in the same second as the one the watermark came from. Being inclusive fixes that, but on its own would also re-match the very review the watermark was derived from, on every later poll, forever. Excluding it explicitly by `id` — rather than by time at all — is what actually distinguishes "the review already handled" from "a new review that happens to share its second."

      The primary check is bot-agnostic by construction: it never looks for a particular bot's name or API, only for *some* formal review object from a non-author. Any tool that submits a review when it finishes satisfies it. A formal review object — not a raw comment count — is the signal, because bots submit one when their pass completes, distinct from individual comments that may stream in while the review is still in progress. Keep that primary check bot-agnostic: do not add a bot-name filter to it. Three narrow exceptions sit on top of it, all deliberately CodeRabbit-specific because they are CodeRabbit's own behaviour rather than anything GitHub models as a review: a rate-limit comment (it hit its per-developer review limit and said so in a top-level PR comment instead of reviewing), a completion comment (it finished a pass with nothing actionable and said so only by editing its rolling walkthrough comment in place), and a comment-update failure (it could not persist that edit at all and posted a failure notice as a separate top-level comment instead). All three are matched narrowly, by CodeRabbit's own login and wording, in `WaitForPrReviewService`; none of them weakens the primary check's bot-agnostic design.

   b. **Timeout handling.** If the command returns `{"found": false, "timedOut": true}`, **Pause** — ask the developer via `AskUserQuestion`, offering two genuine options:
      - **Keep waiting** — re-run the identical `wait-for-pr-review` command with the same watermark epoch for another 20 minutes (this does not consume an extra loop iteration; the watermark does not change, only the wait continues).
      - **Skip the review loop** — leave the loop immediately and continue to step 6.

      This is a Pause rather than an automatic decision because only the developer can diagnose a stuck or missing bot integration — is the app installed, is it down, was this PR excluded by config? Per this project's `AskUserQuestion` convention (`CLAUDE.md`), do not add an explicit free-text or chat option — both are provided automatically.

   b2. **Rate-limit handling.** If the command returns `{"found": false, "rateLimited": true, ...}`, CodeRabbit hit its own per-developer review rate limit and posted a warning comment instead of reviewing. Capture the current epoch — it is needed both to report the wait and to decide whether to Pause at all:
      ```bash
      cd <worktree-path> && date +%s
      ```

      Then report the wait time:
      - If `availableAtEpochSeconds` is present, convert and show it, e.g. "CodeRabbit reports reviews will resume around `<that instant, formatted>`":
        ```bash
        cd <worktree-path> && node -e "console.log(new Date(<availableAtEpochSeconds> * 1000).toString())"
        ```
      - If it is absent, say so plainly: "CodeRabbit's rate-limit comment didn't include a specific wait time — defaulting to a 20-minute wait."

      **Then branch on how far away that resume time is:**

      - **Short wait — `availableAtEpochSeconds` is present *and* less than 3600 seconds (1 hour) after the epoch just captured** (i.e. `<availableAtEpochSeconds> − <now-epoch> < 3600`): **do not Pause.** Print one status line naming the auto-decision, e.g. "CodeRabbit hit its rate limit; reported wait is ~12 min (under 1 hour) — waiting automatically." Then run the **Wait for it, then trigger a review** procedure below immediately, exactly as if the developer had chosen it from the prompt. There is nothing for a developer to usefully decide about a wait this short, and pausing here would stall an otherwise unattended loop.
      - **Long or unknown wait — `availableAtEpochSeconds` is present but 3600 seconds or more away, *or* it is absent entirely:** **Pause** — ask the developer via `AskUserQuestion`, offering two genuine options:
        - **Wait for it, then trigger a review** — run the procedure below.
        - **Skip the review loop** — leave the loop immediately and continue to step 6.

        This is a Pause rather than an automatic decision for the same reason as (b): the wait may be long enough that the developer would rather move on, and only they can judge that — which is exactly why a *short*, known wait skips the prompt instead. Per this project's `AskUserQuestion` convention (`CLAUDE.md`), do not add an explicit free-text or chat option — both are provided automatically.

      **Wait for it, then trigger a review (procedure).** Reached either automatically from the short-wait branch or by the developer choosing it above; it behaves identically in both cases. This retry's watermark is the rate-limit comment's own `submittedAt` (converted to epoch seconds), not the watermark that led into (a). Mirror (a)'s later-iteration step:
      ```bash
      cd <worktree-path> && node -e "console.log(Math.floor(new Date('<rateLimitComment.submittedAt>').getTime() / 1000))"
      ```
      Substitute `<rateLimitComment.submittedAt>` with the exact ISO-8601 value from this round's `rateLimitComment.submittedAt`.

      **Re-capture the current epoch here — do not reuse the epoch captured at the top of (b2)**, which is only for the threshold check: on the long/unknown-wait branch the developer may not answer the `AskUserQuestion` for minutes or hours, leaving that earlier value stale by the time `<trigger-epoch>` and `<timeout>` are computed below.
      ```bash
      cd <worktree-path> && date +%s
      ```

      Then re-run `wait-for-pr-review` with that as the watermark and the same `--exclude-review-id` as before, plus the flags below. Like "Keep waiting" in (b), this does **not** consume a loop iteration — whether it was entered automatically or by the developer's choice.
      ```bash
      cd <worktree-path> && node tools/dev-workflow-cli/dist/main.js wait-for-pr-review <PR> <developer-login> <comment-watermark-epoch> --exclude-review-id=<previous-review-id> --exclude-comment-id=<rateLimitComment.id> --trigger-after=<trigger-epoch> --timeout-ms=<timeout>
      ```
      - Include `--exclude-review-id` only when a previous review's `id` already exists to exclude (i.e. this isn't the very first iteration's wait). Omit it entirely when the rate limit was hit on step (a)'s first iteration, consistent with how (a) itself omits it there.
      - `--exclude-comment-update-failure-id` is deliberately **not** part of this command by default, but if a comment-update-failure comment was also excluded earlier in this loop (a prior (b3) round), keep passing its id alongside this retry — same reasoning as (b3)'s own note about carrying `--exclude-comment-id` forward.
      - `<comment-watermark-epoch>` is the value just computed above, not the watermark from (a).
      - `<trigger-epoch>` is `availableAtEpochSeconds` when present, otherwise the epoch just re-captured above plus 1200 (a 20-minute default).
      - `<timeout>` is `(<trigger-epoch> − now) × 1000 + 1200000` — the wait until reviews resume, plus the standard 20-minute review window that follows the trigger, where `now` is that same freshly re-captured epoch. `wait-for-pr-review` does not compute this itself; it only posts the trigger once the clock crosses `--trigger-after` and keeps polling until its own deadline, so too small a `--timeout-ms` would expire before the triggered review can land.
      - **Why the comment's own `submittedAt`, not the watermark from (a):** `--exclude-comment-id` only ever excludes one id, and the jq filter picks the chronologically-*first* qualifying comment. If a *third* consecutive round reused the original watermark from (a) on every retry, excluding only the newest comment's id would leave the original (now-stale) first comment eligible again — the wait could never progress. Advancing the watermark to the just-found comment's own `submittedAt` on each retry closes that gap, the same way (a)'s carried-forward watermark closes it for reviews (see "Why a carried-forward watermark" above); `--exclude-comment-id` then only has to cover the same-second tie-break case, exactly as `--exclude-review-id` does for reviews.
      - Run it in the background and read its result the same way as in (a), and branch on that result the same way — including landing back here (with a further-advanced comment watermark) if CodeRabbit reports the limit again with a *new* comment. A repeat rate limit re-enters this step (b2) from the top with the *new* comment's data, so the same threshold check applies again: another short wait auto-continues, a long one Pauses.

   b3. **Comment-update-failure handling.** If the command returns `{"found": false, "commentUpdateFailed": true, "commentUpdateFailedComment": {...}}`, CodeRabbit failed to persist an update to its rolling walkthrough comment — after being triggered, or during a normal pass — and posted a failure notice instead of reviewing. Its rolling comment is typically left stuck on "Currently processing new changes in this PR…" and no formal review will ever arrive for this pass. Report the failure comment's `body` verbatim to the developer so they can see CodeRabbit's own error detail (e.g. "putComment timed out").

      Then **Pause** — ask the developer via `AskUserQuestion`, offering two genuine options:
      - **Retry (re-trigger a review)** — this retry's watermark is the failure comment's own `submittedAt` (converted to epoch seconds), not the watermark that led into (a). Mirror (a)'s later-iteration step:
        ```bash
        cd <worktree-path> && node -e "console.log(Math.floor(new Date('<commentUpdateFailedComment.submittedAt>').getTime() / 1000))"
        ```
        Substitute `<commentUpdateFailedComment.submittedAt>` with the exact ISO-8601 value from this round's `commentUpdateFailedComment.submittedAt`. Capture the current epoch too — the retrigger is immediate:
        ```bash
        cd <worktree-path> && date +%s
        ```

        Then re-run `wait-for-pr-review` with that watermark and the flags below. Like "Keep waiting" in (b) and "Wait for it" in (b2), this does **not** consume a loop iteration.
        ```bash
        cd <worktree-path> && node tools/dev-workflow-cli/dist/main.js wait-for-pr-review <PR> <developer-login> <comment-watermark-epoch> --exclude-review-id=<previous-review-id> --exclude-comment-update-failure-id=<commentUpdateFailedComment.id> --trigger-after=<now-epoch> --timeout-ms=1200000
        ```
        - Include `--exclude-review-id` only when a previous review's `id` already exists to exclude (i.e. this isn't the very first iteration's wait). Omit it entirely when the failure hit on step (a)'s first iteration, consistent with how (a) itself omits it there — the same condition (b2) applies.
        - `<comment-watermark-epoch>` is the value just computed above, not the watermark from (a). Advancing it matters for the same reason as in (b2): `--exclude-comment-update-failure-id` only ever excludes one id and the jq filter picks the chronologically-*first* qualifying comment, so a repeated failure on a later poll must be detected as new rather than swallowed by a stale watermark.
        - `--exclude-comment-update-failure-id` is deliberately **not** `--exclude-comment-id`: the two comment kinds are independent GitHub comments with independent ids, and excluding one must never suppress detection of the other on a later poll. If a rate-limit comment was also excluded earlier in this loop, keep passing its `--exclude-comment-id` alongside this flag.
        - `<now-epoch>` is the current epoch just captured — the trigger fires immediately, because (unlike the rate-limit case) CodeRabbit signalled no wait duration for this failure.
        - `--timeout-ms=1200000` is the standard 20-minute review window. No extra trigger-delay component is needed here, unlike (b2), precisely because the trigger fires immediately.
        - Run it in the background and read its result the same way as in (a), and branch on that result the same way — including landing back here (with a further-advanced comment watermark and the newest comment's id) if CodeRabbit reports the same failure again with a *new* comment.
      - **Skip the review loop** — leave the loop immediately and continue to step 6.

      This is a Pause rather than an automatic decision for the same reason as (b) and (b2): only the developer can judge whether to keep waiting on a CodeRabbit-side hiccup or move on. Per this project's `AskUserQuestion` convention (`CLAUDE.md`), do not add an explicit free-text or chat option — both are provided automatically.

   c. **Handle the review.** **REQUIRED SUB-SKILL:** Use the `handle-pr-reviews` skill, targeting this PR by number and always passing its `--skip-deploy-local` flag (`/handle-pr-reviews <PR> --skip-deploy-local`), to discover and triage everything outstanding — inline review comments, top-level comments, and failing CI checks alike, exactly as it does when a developer runs it standalone. Nothing about its own discovery, triage, or reply behavior changes here; the loop only calls it. The flag suppresses just one thing: its Phase 6 `deploy-local` hand-off, which would otherwise stall this unattended loop waiting on a developer decision. Step 6 below still makes that offer once, after the loop ends.

   d. **Exit check.** After that run reports, leave the loop early — before reaching 10 iterations — if any of the following hold:
      - It reported **"No unhandled review comments or failing CI checks found."** — the review is clean, so another iteration has nothing left to find.
      - It **stopped mid-triage on an ambiguous item** (its own Phase 2 behavior when the right classification or fix genuinely isn't clear). Looping again cannot resolve an item that already needed developer judgment, so surface it immediately — report what is ambiguous, matching `handle-pr-reviews`'s own report — instead of silently consuming further iterations.
      - It **made no fix commits** — nothing was pushed. `handle-pr-reviews`'s own Phase 7 summary reports whether anything was pushed; when its Phase 2 found every outstanding item to be a question answered or a suggestion rejected, with no code change, it skips its own Phase 4 push step and its own Phase 6 `deploy-local` hand-off, so no new commit exists for the bot to review. Looping again cannot produce a new review when there is nothing new to review — leave the loop early instead of burning another full wait for nothing. This bullet requires an actual Phase 7 summary reporting no push — it does not match a still-in-progress report (see below), which stops inside Phase 1 and never reaches Phase 7 at all.

      Otherwise start the next iteration at (a).

      **A still-in-progress report is not an exit condition.** If the run reported **"CodeRabbit's review is still in progress after waiting for it to finish; no other unhandled review comments or failing CI checks were found, but a review may still be forthcoming."**, that is `handle-pr-reviews`'s own Phase 1 giving up on its short (~2 minute) bounded wait for CodeRabbit's rolling comment to leave its in-progress state — not a verdict that the review is done. It is not the clean-verdict signal in the first bullet above, and it is not the "made no fix commits" signal in the third bullet either: that bullet infers from a Phase 7 summary this run never produces, because it stops inside its own Phase 1, before Phase 4's push step or Phase 7's summary ever run. This loop has its own, far longer budget (up to 20 minutes per wait, up to 10 iterations) that exists precisely to absorb a review running slower than that short internal poll — queue depth, rate limits, or a large diff routinely make it so. So fall through here: start the next iteration at (a), advancing the watermark to this iteration's found review exactly as (a)'s later-iteration bullet already describes — step (a)'s wait (or a (b)/(b2)/(b3) retry of it) already found a formal review before this iteration ever reached (c) and (d), so the still-in-progress report changes nothing about how the next watermark is derived. That consumes one of the 10 iterations, exactly like any other unresolved outcome; if CodeRabbit stays mid-review long enough, the loop eventually reaches an ending regardless — whether that is the iteration cap, or a timeout in (b) if the next wait finds nothing new to advance to — and continues to step 6 with the PR already created either way.

      Failing CI checks need no separate tracking: `handle-pr-reviews`'s "nothing unhandled" signal already covers them, and a push that fixes review comments can itself trigger new CI runs worth checking on the next pass.

   **After the loop** — whether it exited early or reached the 10-iteration cap — continue into step 6 unchanged. Print a brief status line noting how the loop ended (clean, ambiguous item surfaced, no fix commits pushed, iteration cap reached, timed out and skipped, or skipped because the login lookup failed). CodeRabbit still being mid-review is never an ending on its own — it appears only as the proximate cause of whichever ending does occur, e.g. "iteration cap reached — still waiting on CodeRabbit" or "timed out and skipped while CodeRabbit was still mid-review".
6. After the PR is created, **REQUIRED SUB-SKILL:** Use the `deploy-local` skill to offer the developer a local look at the change. This is the **only** `deploy-local` offer this workflow produces: step 5c dispatches `handle-pr-reviews` with `--skip-deploy-local`, so its own Phase 6 hand-off never fires inside the loop, no matter how many times it pushed a fix. That makes this invocation the single, intentional chance to see the fully-reviewed state — not a bug to suppress or skip. (A developer running `handle-pr-reviews` standalone outside this workflow still gets its own offer; that is out of scope here.) `deploy-local` asks up front which of its six actions to perform — deploy the stack, run the manual import before and/or after the other importers, run the BBL import, run the TP import, generate a SchemaSpy diagram — in any combination; selecting none is valid and means no action is taken. Do not ask the developer separately before invoking it.
   - **Discord slash-command propagation reminder.** Check whether the branch's diff touches Discord slash-command registration or definitions:
     ```bash
     git diff --name-only origin/main...HEAD -- packages/discord-client/src/discord-client.service.ts apps/discord-bot/src/slash-commands/
     ```
     If this prints any file paths, print the following reminder to the developer alongside the `deploy-local` hand-off:
     > This branch changes Discord slash-command registration or definitions. Commands are registered globally, and Discord can take up to ~1 hour to propagate a changed command's name, description, or options — so your slash commands may still show their old definitions in Discord for a while after the deploy. That is expected, not a failed deploy. Changes to how a command answers (handler logic) take effect as soon as the bot restarts.
     If it prints nothing, skip the reminder silently — no status line, no mention.
7. **Skill ends** — human review and merge happen outside this workflow. The automated review bot's feedback has already been driven to completion in step 5, so what reaches the human is a PR that has been through both Claude's self-review and an independent bot pass. Once the developer confirms the PR has merged, use the `wrap-up` skill to verify the merge and clean up local state.
