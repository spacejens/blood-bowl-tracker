# Development Workflow

Development in this project is structured by a set of Claude Code skills — see the subsections below for what each one does.

Each skill isolates its work in its own git worktree, so it never touches your current checkout while it runs.

Every skill converges on a pull request rather than merging anything itself: human review and merge always happen outside the Claude workflow, so every change is visible on GitHub before it lands.

Each skill's own `SKILL.md` under `.claude/skills/` is the source of truth for its exact phase-by-phase behavior — this document only orients you to which skill to reach for and how they fit together.

## develop-feature

Builds a feature end-to-end: from a GitHub issue (`/develop-feature 42`) or a free-form description (`/develop-feature Add player stats endpoint`), through brainstorming a spec, writing an implementation plan, implementing it task-by-task with tests, self-review, opening a PR, and then waiting for the automated review bot's review and driving it to completion through `handle-pr-reviews`. This is the default entry point for any new feature or bug fix.

## handle-pr-reviews

Processes reviewer feedback on an already-open PR (`/handle-pr-reviews`, or `/handle-pr-reviews <N>` for a specific PR). Finds unhandled inline and top-level comments, fixes or rejects each with verification, pushes the results, and replies to every comment. Run this after a PR — from `develop-feature` or otherwise — receives review feedback, including Claude's own self-review comments.

## code-hygiene

Runs a fixed set of code cleanup checks — Node version updates, unused dependency/dead code removal, a security audit, workspace version consistency, circular dependency detection, lint, and format — and opens a PR with the results (`/code-hygiene`). Unlike `develop-feature`, there's no specification or planning step: the checks and their order are fixed. Run this periodically, or whenever the codebase needs a cleanup pass, independent of feature work. Ordinary dependency and Docker image updates are not part of it — Renovate opens those PRs on its own, configured by `renovate.json5` at the repo root.

## wrap-up

Verifies that work the developer says is finished is actually finished — checks the PR really merged on GitHub and that nothing was left uncommitted or unpushed outside the worktree — then offers to stop local Docker containers, remove the git worktree, and delete the local branch. Most often triggered conversationally (e.g. "that's merged"), though the developer can also run `/wrap-up` directly; run this after a `develop-feature` or `handle-pr-reviews` cycle's PR has merged.

## write-issue

Turns a free-form idea (`/write-issue <text>`) into one or more well-worded GitHub issues, through a short clarifying dialogue on purpose and scope. Can produce several issues from one request (e.g. "find the remaining gaps in X and write an issue for each"). Matches this repo's existing issue style — plain-text intent, not overly specific — so issues stay a durable statement of need rather than a stale implementation spec. Independent of the `develop-feature` cycle; the issues it creates are picked up by `develop-feature` later.

## Continuous integration

Every pull request triggers the GitHub Actions workflow in `.github/workflows/ci.yml`. It runs the same checks as the local `pnpm verify` script, but as separate, individually visible jobs so a failure points straight at the check that broke:

- **`lint`** — `pnpm build` then `pnpm lint`
- **`typecheck`** — `pnpm build` then `pnpm typecheck`
- **`test`** — `pnpm build` then `pnpm test`

Each job is self-contained: it checks out the code, provisions pnpm via Corepack and Node via `.nvmrc`, installs with `--frozen-lockfile`, and rebuilds the workspace before running its check. The three jobs run in parallel.

A fourth job, **`gatekeeper`**, depends on all three and fails if any of them failed or was cancelled. It is the single status check branch protection requires — so the internal `lint`/`typecheck`/`test` jobs can be added, removed, or renamed later by editing only the workflow file, without ever touching the branch protection ruleset.

### Requiring the gatekeeper check (one-time, manual)

Branch protection is configured by hand in the GitHub UI via **Rulesets** (Settings → Rules → Rulesets) — it cannot be set by code in this repo. A repository can have several rulesets targeting the same branch at once; their rules simply combine, so this doesn't need to be the only ruleset covering `main`. After this pipeline has landed on `main` and run at least once (so GitHub knows the check name), do this once:

1. Repo **Settings → Rules → Rulesets → New ruleset → New branch ruleset**.
2. Name it (e.g. `main`) and set **Enforcement status** to **Active**.
3. Under **Target branches**, add the default branch.
4. Under **Rules**, enable **Require a pull request before merging**.
5. Also under **Rules**, enable **Require status checks to pass**, add the **`gatekeeper`** check as a required status check, and enable **Require branches to be up to date before merging**.
6. **Save changes.**

Require only `gatekeeper` — not the individual `lint`/`typecheck`/`test` checks — so the pipeline's internal structure can change without a ruleset edit.

## Automated PR review (CodeRabbit)

Every pull request is also reviewed by [CodeRabbit](https://coderabbit.ai), an automated review bot. It's a second, independently-biased pass over each PR alongside the self-review Claude performs before opening it — this repo has no human co-reviewers during development, so without a bot every PR would reach the merge button having been read only by the same assistant that wrote it. CodeRabbit is free for public repositories with no PR cap, which is why it was chosen over the metered alternatives.

Its behavior is configured by `.coderabbit.yaml` at the repo root: auto-review is enabled for every PR opened or updated against `main`, regardless of author (every PR here is opened by Claude through the developer's own `gh` account, so an author filter would switch reviews off entirely), and its `path_instructions` point it at this repo's conventions in `CLAUDE.md` so it judges against those rather than generic defaults.

CodeRabbit's review is **informational** — it is deliberately not wired in as a required status check. `gatekeeper` remains the only check branch protection requires; see "Requiring the gatekeeper check" above.

### Installing the CodeRabbit app (one-time, manual)

Like branch protection, this can't be configured by code in this repo — a GitHub App has to be installed through the browser. Do this once:

1. Go to the [CodeRabbit GitHub App](https://github.com/apps/coderabbitai) on the GitHub Marketplace and choose **Install** (or **Configure**, if it's already installed for your account).
2. Grant it access to this repository — either "All repositories" or "Only select repositories" with `blood-bowl-tracker` selected.
3. Sign in to the [CodeRabbit dashboard](https://app.coderabbit.ai) with the same GitHub account and confirm the repository is listed and enabled.
4. Confirm auto-review-on-PR-open is on. This is CodeRabbit's default, and `.coderabbit.yaml` sets it explicitly, so the committed config wins — no dashboard change should be needed.

Nothing else is required to *use* the reviews: `develop-feature`'s Phase 6 waits for the review after it opens a PR and drives it to completion through `handle-pr-reviews` automatically (see the `develop-feature` section above). If the app is not installed, that wait simply times out after 10 minutes and asks you whether to keep waiting or skip ahead.

## How they fit together

Issues are the starting point for `develop-feature`'s issue mode. They can be created manually (or through any other means) directly on GitHub as usual, or by a developer using the `write-issue` skill.

A typical cycle: `develop-feature` takes an issue to a PR → the automated review bot reviews it and `develop-feature` drives that feedback to completion through `handle-pr-reviews` before it finishes → a human reviews what's left → `handle-pr-reviews` addresses any further feedback → the PR merges → `wrap-up` verifies the merge and cleans up local state. `code-hygiene` runs on its own schedule, whenever a developer chooses, unrelated to any specific feature PR — it keeps dependencies current and the codebase free of dead code and lint/format drift.
