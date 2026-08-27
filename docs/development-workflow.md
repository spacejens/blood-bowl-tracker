# Development Workflow

Development in this project is structured by a set of Claude Code skills — see the subsections below for what each one does.

Most skills isolate their work in its own git worktree and converge on a pull request, so human review and merge always happen outside the Claude workflow and every change is visible on GitHub before it lands. The exception is a skill whose only output is GitHub issues rather than a code or doc change — `write-issue` and `codebase-review` — which runs against the current checkout and opens no PR, since there is no working-tree change to isolate or merge.

Each skill's own `SKILL.md` under `.claude/skills/` is the source of truth for its exact phase-by-phase behavior — this document only orients you to which skill to reach for and how they fit together.

## develop-feature

Builds a feature end-to-end: from a GitHub issue (`/develop-feature 42`) or a free-form description (`/develop-feature Add player stats endpoint`), through brainstorming a spec, writing an implementation plan, implementing it task-by-task with tests, self-review, opening a PR, and then waiting for the automated review bot's review and driving it to completion through `handle-pr-reviews`. This is the default entry point for any new feature or bug fix.

## handle-pr-reviews

Processes reviewer feedback on an already-open PR (`/handle-pr-reviews`, or `/handle-pr-reviews <N>` for a specific PR). Finds unhandled inline and top-level comments, fixes or rejects each with verification, pushes the results, and replies to every comment. Run this after a PR — from `develop-feature` or otherwise — receives review feedback, including Claude's own self-review comments.

## code-hygiene

Runs a fixed set of code cleanup checks — Node version updates, unused dependency/dead code removal, a security audit, workspace version consistency, circular dependency detection, lint, and format — and opens a PR with the results (`/code-hygiene`). Unlike `develop-feature`, there's no specification or planning step: the checks and their order are fixed. Run this periodically, or whenever the codebase needs a cleanup pass, independent of feature work. Ordinary dependency and Docker image updates are not part of it — Renovate opens those PRs on its own, configured by `renovate.json5` at the repo root, once the [Renovate GitHub App](https://github.com/apps/renovate) is installed on this repo (a one-time manual setup step; `renovate.json5` alone does not install or grant it access).

## finish-renovate-pr

Takes one stuck Renovate dependency-update PR to a mergeable state (`/finish-renovate-pr 544`). Renovate opens these PRs on its own and automerges npm patch and minor updates once CI passes; everything else — major bumps, Docker tag updates, and anything whose CI fails — waits for a human. This skill investigates why a given one is stuck (reading Renovate's own PR body and changelog links, the failing CI job's logs, and how the dependency is actually used here), makes whatever code changes the update needs, and pushes them back onto Renovate's own branch so the existing PR is updated in place — it never opens a new PR, so the PR's number, its `renovate:<updateType>` label, and its review history all survive.

It takes a **pull request** number rather than an issue number, and handles one PR per run. Two consequences of pushing onto Renovate's branch are worth knowing: Renovate stops rebasing a branch once it carries commits it did not author, and ticking the "rebase/retry" checkbox in its PR body after that point discards those commits — so merge the PR rather than asking Renovate to retry it. Often the outcome is that no code change is needed at all: a green major bump is stuck only because `renovate.json5` deliberately does not automerge it, and the skill then reports it as ready for human review and stops without pushing anything.

## wrap-up

Verifies that work the developer says is finished is actually finished — checks the PR really merged on GitHub and that nothing was left uncommitted or unpushed outside the worktree — then offers to stop local Docker containers, remove the git worktree, and delete the local branch. Most often triggered conversationally (e.g. "that's merged"), though the developer can also run `/wrap-up` directly; run this after a `develop-feature` or `handle-pr-reviews` cycle's PR has merged.

## deploy-local

Builds and starts the full stack locally via Docker Compose, confirms both containers come up healthy, and can also run the `tools/import-bbl` and `tools/import-tp` data imports (and the manual import, the match/player review tools, and SchemaSpy diagram generation) against the running instance, so a developer can see a change running end to end (`/deploy-local`). Invoked directly, or offered by `develop-feature` after a PR is created and by `handle-pr-reviews` after pushing fixes. It leaves the containers running — it's a manual-inspection tool, not a one-shot smoke test.

## deploy-production

Operates the already-deployed production Discord bot on Fly.io and Neon (`/deploy-production`): check deployment status, restart the machine, roll back to a previous release, trigger a redeploy of current `main` without a new merge, drop and recreate the production database, run read-only queries against the production database, and run the manual/BBL/TP importers against production. It does not perform normal deploys — those happen automatically in GitHub Actions on every merge to `main` (`.github/workflows/deploy.yml`); the closest thing offered here is dispatching that same workflow against the current `main`. See `docs/discord-bot/production-hosting.md` for the underlying commands this skill wraps.

## write-issue

Turns a free-form idea (`/write-issue <text>`) into one or more well-worded GitHub issues, through a short clarifying dialogue on purpose and scope. Can produce several issues from one request (e.g. "find the remaining gaps in X and write an issue for each"). Matches this repo's existing issue style — plain-text intent, not overly specific — so issues stay a durable statement of need rather than a stale implementation spec. Independent of the `develop-feature` cycle; the issues it creates are picked up by `develop-feature` later.

## codebase-review

Reviews the whole codebase against a fixed list of criteria — repo conventions no ESLint rule enforces, plus documentation quality — and, once you confirm what it found, reports it as GitHub issues (`/codebase-review`). It changes nothing and opens no PR; see `.claude/skills/codebase-review/SKILL.md` for the exact criteria and confirmation flow. Run it periodically, independent of feature work; `code-hygiene` is its counterpart for the mechanical checks a tool can fix on its own.

## Continuous integration

Every pull request triggers the GitHub Actions workflow in `.github/workflows/ci.yml`. Four of its jobs run the same checks as the local `pnpm verify` script, but as separate, individually visible jobs so a failure points straight at the check that broke:

- **`lint`** — `pnpm build` then `pnpm lint`
- **`typecheck`** — `pnpm build` then `pnpm typecheck`
- **`test`** — `pnpm build` then `pnpm test`
- **`format`** — `pnpm build` then `pnpm format`

Each of those four is self-contained: it checks out the code, provisions pnpm via Corepack and Node via `.nvmrc`, installs with `--frozen-lockfile`, and rebuilds the workspace before running its check.

Two further jobs have no `pnpm verify` counterpart — they check things only CI is set up to check:

- **`docker-build`** — builds the `apps/discord-bot` Docker image, so a broken Dockerfile surfaces on the PR rather than on the deploy that follows a merge.
- **`schemaspy-build`** — starts postgres, runs the `packages/db` migrations against it, and generates the diagram with `pnpm run db:diagram`. SchemaSpy has no Dockerfile of its own, so what this validates is that the prebuilt public image pulls and runs successfully against this repo's actual schema and config.

All six jobs run in parallel.

A seventh job, **`gatekeeper`**, depends on all six and fails if any of them failed or was cancelled. It is the single status check branch protection requires — so the six jobs behind it can be added, removed, or renamed later by editing only the workflow file, without ever touching the branch protection ruleset.

### Requiring the gatekeeper check (one-time, manual)

Branch protection is configured by hand in the GitHub UI via **Rulesets** (Settings → Rules → Rulesets) — it cannot be set by code in this repo. A repository can have several rulesets targeting the same branch at once; their rules simply combine, so this doesn't need to be the only ruleset covering `main`. After this pipeline has landed on `main` and run at least once (so GitHub knows the check name), do this once:

1. Repo **Settings → Rules → Rulesets → New ruleset → New branch ruleset**.
2. Name it (e.g. `main`) and set **Enforcement status** to **Active**.
3. Under **Target branches**, add the default branch.
4. Under **Rules**, enable **Require a pull request before merging**.
5. Also under **Rules**, enable **Require status checks to pass**, add the **`gatekeeper`** check as a required status check, and enable **Require branches to be up to date before merging**.
6. **Save changes.**

Require only `gatekeeper` — not the individual jobs behind it — so the pipeline's internal structure can change without a ruleset edit.

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

A typical cycle: `develop-feature` takes an issue to a PR → the automated review bot reviews it and `develop-feature` drives that feedback to completion through `handle-pr-reviews` before it finishes → a human reviews what's left → `handle-pr-reviews` addresses any further feedback → the PR merges → `wrap-up` verifies the merge and cleans up local state. `code-hygiene` and `codebase-review` both run on their own schedule, whenever a developer chooses, unrelated to any specific feature PR — `code-hygiene` keeps the Node version current and the codebase free of dead code and lint/format drift, while `codebase-review` files issues for the convention and documentation drift that no tool can fix on its own. Renovate's own dependency PRs run on a third track, outside all of these: `finish-renovate-pr` picks up whichever of them got stuck and drives it to merge-ready, reusing `handle-pr-reviews` (with `--skip-deploy-local`, offering `deploy-local` separately at the end) and `wrap-up` the same way a `develop-feature` cycle does — without opening a new PR or syncing `main` in, since Renovate's PR and branch already exist.
