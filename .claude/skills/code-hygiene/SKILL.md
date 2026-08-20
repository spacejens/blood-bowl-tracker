---
name: code-hygiene
description: Use for an on-demand code hygiene pass in the blood-bowl-tracker project — updates the pinned Node version (.nvmrc, Dockerfile base images, and @types/node in lock-step), removes unused dependencies and dead code, fixes dependencies that should be devDependencies, runs a security audit, fixes workspace version mismatches, checks for circular dependencies, and fixes lint/formatting, opening a single PR with the results. Ordinary dependency and Docker image updates are handled by Renovate, not this skill.
---

# code-hygiene

Runs a fixed set of code hygiene checks — Node version updates, unused dependency/dead code removal, dependency placement (dependencies vs. devDependencies), a security audit, workspace version consistency, circular dependency detection, lint, and format — and opens a single pull request with the results. Unlike `develop-feature`, there is no specification or planning step: the checks and their order are fixed every run.

Ordinary npm dependency updates and Docker image tag bumps are **not** part of this skill — Renovate proposes those as its own PRs, configured by `renovate.json5` at the repo root. The one exception is the Node version, which this skill still owns (Task 1) because it has to move `.nvmrc`, every Dockerfile `FROM node:...` line, and every workspace's `@types/node` in lock-step; `renovate.json5` disables Renovate for `node` and `@types/node` so the two systems never conflict.

## Invocation

```
/code-hygiene
```

Takes no arguments; always runs the full fixed task list below.

## Relationship to develop-feature

This skill reuses `develop-feature`'s Setup, Development, Self-review, and Integration phases directly — read `.claude/skills/develop-feature/SKILL.md` and follow those phases exactly, with the differences below. There is no Specification or Planning phase: the fixed task list in this document stands in for the "approved plan" that the Development phase executes.

### Setup — differences from develop-feature's ad-hoc mode

Follow develop-feature's ad-hoc-mode Setup phase, with these changes:

- Skip its text-description step (there is no free-form feature description) and its branch-name confirmation step (there is no slug to derive or confirm — see branch name below). Go straight to worktree creation.
- **REQUIRED SUB-SKILL:** Use `superpowers:using-git-worktrees` to create an isolated worktree, exactly as develop-feature's Setup phase does.
- Skip develop-feature's `docs/plans/` symlink step — this skill produces no spec or plan document.
- Branch name is always `code-hygiene-{YYYY-MM-DD}` using today's date, e.g. `code-hygiene-2026-07-03` — no confirmation prompt.
- Print a brief status line confirming the worktree path and baseline test result, then continue immediately into the fixed task list below (standing in for develop-feature's Development phase).

### Development, Self-review, Integration — same as develop-feature, with these differences

- **Development:** execute the fixed task list below instead of a written plan. Otherwise identical — one commit per completed task, `pnpm verify` after each, `superpowers:test-driven-development` and `superpowers:systematic-debugging` apply exactly as develop-feature's Development phase describes when a task involves writing or fixing code.
- **Self-review:** identical to develop-feature's Self-review phase.
- **Integration:** identical to develop-feature's Integration phase, except the PR:
  ```bash
  gh pr create \
    --title "Code hygiene: <YYYY-MM-DD>" \
    --body "$(cat <<'EOF'
  ## Summary
  <one bullet per task that made a commit, summarizing what changed>
  EOF
  )"
  ```
  No `Closes #N` — a `code-hygiene` run isn't tied to a GitHub issue.

## Config files

Two of the three tools below read a config file, committed at the repo root: `knip.jsonc` and `syncpack.config.js`. These are living files: a developer may hand-edit them later (e.g. to mark a dependency as intentionally unused via Knip's `ignoreDependencies`, group specific dependencies together via syncpack's `versionGroups`, or silence a false-positive dead-code finding), and those edits must persist across future `code-hygiene` runs — this skill never overwrites them.

### `knip.jsonc`

```jsonc
{
  // Full config reference: https://knip.dev/reference/configuration
  "$schema": "https://unpkg.com/knip@6/schema.json",
  "workspaces": {
    "apps/*": {},
    "packages/*": {},
    "tools/*": {}
  }
  // Add "ignore" (file globs) or "ignoreDependencies" (package names) here
  // to silence false positives, e.g.:
  // "ignoreDependencies": ["some-package-only-used-via-a-cli-script"]
}
```

### `syncpack.config.js`

```js
// Full config reference: https://syncpack.dev/config-file
/** @type {import('syncpack').RcFile} */
module.exports = {
  // Add versionGroups or semverGroups here to let specific dependencies
  // intentionally diverge across workspaces instead of being flagged, e.g.:
  // versionGroups: [
  //   { label: 'pin typescript everywhere', dependencies: ['typescript'], pinVersion: '5.9.3' },
  // ],
};
```

madge (circular dependencies) takes no config file — it's invoked with CLI flags only.

All three tools are already pinned root `devDependencies` with their `hygiene:*` scripts already in root `package.json` — nothing to install or bootstrap; every task below that uses one of these tools just runs its script. Task 1 (Node version updates) is the exception: it queries nodejs.org, Docker Hub, and `npm view` directly rather than running a `hygiene:*` script.

`renovate.json5` at the repo root is a third config file this skill never touches at all — it belongs to Renovate, which runs on its own outside any `code-hygiene` pass. It is mentioned here only so a reader looking for "where did dependency updates go" finds the answer.

## Fixed task list (Development phase)

One commit per task, `pnpm verify` after each (per develop-feature's Development phase discipline). A task that finds nothing to change makes no commit.

### Task 1: Node version updates

Node's base-image tag is tied to the Node version this repo runs, so it can't be bumped on its own: it moves together with `.nvmrc` and every workspace's `@types/node`, all three in lock-step. That lock-step requirement — plus LTS-aware resolution of the `-alpine` tag suffix this repo uses — is why this one update stays here instead of going to Renovate (see https://github.com/renovatebot/renovate/issues/13270). Every *other* npm dependency and every other pinned Docker image tag (currently `postgres` and `schemaspy` in `docker-compose.yml`) is Renovate's job, and `renovate.json5` sets `enabled: false` for `node` and `@types/node` so the two systems never propose competing updates.

Scope: `.nvmrc`, every `FROM node:...` line in every `Dockerfile*` (currently `node:24-alpine`, in the two build stages of `apps/discord-bot/Dockerfile`), and every workspace `package.json` that declares `@types/node`. These all change together, in a single commit.

This task computes its four targets fresh from external sources every run — never diffed against "what changed since last time" — so a run started with `.nvmrc`, the Dockerfile tag, and `@types/node` already out of step with each other (e.g. from a manual edit) self-heals to the same computed target. No separate drift-detection mode is needed.

1. **Determine the target Node major.** Query `https://nodejs.org/dist/index.json`, filter to entries where `lts` is truthy, take the newest entry — its major version is the target. LTS-only, per project policy: this repo runs a production service and should stay on a supported line, never a Current release. (Node's release schedule used to skip LTS for odd-numbered majors entirely, but starting with Node 27 every major eventually reaches LTS, so oddness alone is no longer a valid signal — the `lts` filter above is what actually enforces the policy, and is unaffected by that change.)
2. **Determine the target Dockerfile tag.** Query Docker Hub's tag listing for `library/node`, filter to tags matching `<target-major>-alpine`, take the highest:
   ```bash
   curl -s "https://hub.docker.com/v2/repositories/library/node/tags/?page_size=100" | jq -r '.results[].name'
   ```
   This guards against a newly-LTS major not having a published alpine image yet.
3. **Determine the target `.nvmrc` version.** The highest full version (`<major>.<minor>.<patch>`) nodejs.org's index reports for the target major.
4. **Determine the target `@types/node` version per workspace.** `npm view @types/node versions --json`, filter to versions whose major equals the target Node major, take the highest. Apply per workspace `package.json` that declares `@types/node` (root and/or individual workspaces, whichever currently list it).

Find the files that must change with:

```bash
find . -not -path "./node_modules/*" -not -path "*/node_modules/*" -name "Dockerfile*" -exec grep -Hn "^FROM node:" {} \;
grep -rn '"@types/node"' --include=package.json --exclude-dir=node_modules .
```

Skip stage-alias `FROM` lines (a `FROM builder` referring to an earlier `AS builder` stage in the same file carries no tag to update).

If `.nvmrc`, every `FROM node:...` line, and every workspace's `@types/node` entry already match the computed targets, this task makes no commit. Otherwise:

1. Edit `.nvmrc` to the target full version.
2. Edit every `FROM node:...` line in the repo to `FROM node:<target-major>-alpine`.
3. Edit every workspace `package.json`'s `@types/node` entry to the target version, preserving its existing range-prefix style (`^`, `~`, or exact).
4. Re-source nvm so the rest of this task's verification runs under the new Node, not the previous shell's stale interpreter:
   ```bash
   source ~/.nvm/nvm.sh && nvm install && nvm use
   ```
   (`nvm install` with no version argument reads `.nvmrc` in the current directory.)
5. `pnpm install` (refreshes the lockfile for the `@types/node` bump, and reinstalls under the new Node for any native deps).
6. `pnpm verify`.
7. **If it passes:** one commit covering `.nvmrc`, the Dockerfile, and every changed `package.json` together — e.g. "Update Node to 28 (LTS), sync .nvmrc and @types/node". This is one logical change; splitting it across commits would leave intermediate commits with a broken invariant (Dockerfile and `.nvmrc` disagreeing, or `@types/node`'s major mismatched).
8. **If it fails:** **REQUIRED SUB-SKILL:** Use `superpowers:systematic-debugging` to diagnose, then:
   - **Mechanical migration** needed (e.g. a config flag renamed between major versions) — make the fix now, as part of this same commit.
   - **Judgment call** needed (the fix isn't mechanical — it requires a product or architecture decision) — stop. Report what's already committed this run, then ask the developer whether to fix it manually and resume, skip the Node update and continue with the rest of the task list, or abort the run. Commits already made are not rolled back.

`pnpm verify` only confirms nothing else in the repo broke under the new Node — it does not confirm the new base image actually builds, because `verify` reinstalls and rebuilds under the *host's* Node/OS, not inside the Docker build context. So a Node bump must also be confirmed by actually building the image:

```bash
docker compose build discord-bot
```

An alpine base bump can break native-module builds in ways `pnpm verify` alone won't catch.

### Task 2: Security audit

```bash
pnpm run hygiene:audit:fix
pnpm run hygiene:audit
```

The first command attempts to update vulnerable packages to non-vulnerable versions within the lockfile (`--fix=update`, not `--fix=override` — `update` doesn't leave permanent `pnpm.overrides` entries in `package.json` behind once the real fix ships upstream). The second re-reports what's left. Run `pnpm verify`. If any vulnerability remains reported, stop and ask the developer how to proceed (accept the risk, find an alternative package, or abort the run) — do not leave it unmentioned or deferred to the PR description.

### Task 3: Unused dependencies / dead code / dependency placement

```bash
pnpm run hygiene:deadcode:fix
pnpm run hygiene:deadcode
pnpm run hygiene:deadcode:production
```

The first command removes what Knip can safely auto-fix. The second re-reports what's left (Knip can't auto-fix every issue type — e.g. some unused exports need a human judgment call about whether they're a public API); call this **Report A**. The third runs Knip in production mode, which scans only production source files and excludes `devDependencies` from consideration; call this **Report B** — any `dependencies` entry it reports as unused is unused specifically in production code (it may still be used in tests, scripts, or tooling).

**Compute placement candidates:** any package in Report B's "Unused dependencies" that does *not* also appear in Report A's "Unused dependencies". (Anything in both reports is fully unused everywhere — that's Report A's problem, handled by the stop condition below, not this step.) Report B's own output includes the exact `package.json` path for each finding.

For each placement candidate, investigate directly rather than moving it automatically:
- Grep that workspace's production `src` (excluding `test/`, config files, build scripts) for any import/require of the package.
- Check whether the package name appears in any `package.json` `scripts` entry in that workspace (CLI/bin usage is a legitimate non-import use).
- Consider known framework peer-dependency patterns (e.g. a NestJS package that requires `@nestjs/core` as an implicit peer of `@nestjs/common` even without a direct import) — this check overrides the first two: a package that is plausibly a framework core/peer dependency should not be called dev-only just because grep and scripts turned up nothing.

Then:
- **Confidently dev-only** — no import, no scripts usage, and no plausible framework core/peer role; move the entry from `dependencies` to `devDependencies` in that workspace's `package.json`, keeping its existing version specifier exactly as written.
- **Confidently a false positive** — leave it in place; no developer interruption needed.
- **Ambiguous** — stop and ask the developer (see Stop conditions below).

If any entries were moved, run `pnpm install` to refresh `pnpm-lock.yaml`. Run `pnpm verify` — but note that a pass here is not evidence the move was correct: a default `pnpm install` installs `devDependencies` for every workspace regardless of any production install boundary, so `pnpm verify` will pass even for a wrongly-demoted runtime dependency. The per-candidate investigation above is the only real safeguard against that, so err toward Ambiguous/stop whenever in doubt. If Report A (not Report B) reports any remaining issue, stop and ask the developer how to proceed (delete manually, mark as intentionally kept via `ignore`/`ignoreDependencies` in `knip.jsonc`, or abort the run) — this is a judgment call the skill should not make silently.

### Task 4: Workspace version consistency

```bash
pnpm run hygiene:versions:fix
pnpm run hygiene:versions
```

The first command fixes what syncpack can resolve automatically. The second re-reports what's left (syncpack can't always tell which of several divergent versions across workspaces is "correct"). Run `pnpm verify`. If the second command reports any remaining mismatch, stop and ask the developer which version should win, or how to configure a `versionGroups` entry in `syncpack.config.js` to allow the divergence intentionally.

### Task 5: Circular dependencies

```bash
pnpm run hygiene:cycles
```

Report-only — madge cannot fix a cycle automatically. If it reports any circular dependency, stop and ask the developer how to proceed. Unlike Tasks 2–4, this task never has a "fix" step — any finding here always pauses the run.

### Task 6: Lint

```bash
pnpm lint:fix
```

Run `pnpm verify`. Per this project's existing convention (`CLAUDE.md`), hand-edit only failures `pnpm lint:fix` can't auto-resolve — this is routine mechanical work, not a judgment call, so it is not a stop condition.

### Task 7: Format

```bash
pnpm format:fix
```

Run `pnpm verify`.

## Stop conditions

Any finding a task can't safely auto-fix pauses the run immediately for developer direction, rather than being deferred into the PR description:

- Task 1: a Node update's `pnpm verify` failure that needs a judgment call to resolve (not just mechanical migration) after `systematic-debugging`. See Task 1 above for the full workflow. Commits already made earlier in the run are kept, not rolled back.
- Task 2: a security vulnerability with no available patched version.
- Task 3: any dead-code/unused-dependency finding Knip couldn't auto-fix, or any dependency-placement candidate whose dev-only-vs-production-need status can't be confidently determined after investigation.
- Task 4: any version mismatch syncpack couldn't auto-fix.
- Task 5: any circular dependency at all (this check never auto-fixes).

Tasks 6 and 7 have no stop condition — remaining lint/format issues after `--fix` are routine hand-edits per this project's existing convention, not judgment calls.

When paused, report what was found, what's already committed so far in the run, and wait for developer direction (fix manually, skip this item and continue, or abort the run) before resuming.
