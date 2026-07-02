---
name: code-hygiene
description: Use for an on-demand dependency and code hygiene pass in the blood-bowl-tracker project — updates dependencies, removes unused dependencies and dead code, runs a security audit, fixes workspace version mismatches, checks for circular dependencies, and fixes lint/formatting, opening a single PR with the results
---

# code-hygiene

Runs a fixed set of dependency and code hygiene checks — dependency updates, unused dependency/dead code removal, a security audit, workspace version consistency, circular dependency detection, lint, and format — and opens a single pull request with the results. Unlike `develop-feature`, there is no specification or planning step: the checks and their order are fixed every run.

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

Three of the five tools below read a committed config file. Task 1 (Bootstrap) creates each one **only if it doesn't already exist** — never overwrites an existing one. These are living files: a developer may hand-edit them later (e.g. to exclude a dependency from audit/updates, group specific dependencies together, or silence a false-positive dead-code finding), and those edits must persist across future `code-hygiene` runs.

### `renovate.json5`

```json5
{
  // Full config reference: https://docs.renovatebot.com/configuration-options/
  //
  // This file is NOT used to drive dependency updates locally — Renovate's
  // `--platform=local` mode can only analyze, it cannot write changes to
  // disk. It exists so a future GitHub-hosted Renovate app/action can pick
  // up this exact config without starting from scratch. The code-hygiene
  // skill only validates that this file stays syntactically correct
  // (`pnpm run hygiene:deps:validate-config`) — it does not run Renovate
  // itself.
  $schema: 'https://docs.renovatebot.com/renovate-schema.json',
  extends: ['config:recommended'],
  packageRules: [
    {
      groupName: 'all dependencies',
      matchPackageNames: ['*'],
    },
    // Add packageRules entries here to exclude specific dependencies, or to
    // group specific ones together differently than "everything in one
    // group", e.g.:
    // {
    //   groupName: 'eslint',
    //   matchPackageNames: ['eslint', 'eslint-*', '@eslint/*', 'typescript-eslint'],
    // },
  ],
}
```

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

## Fixed task list (Development phase)

One commit per task, `pnpm verify` after each (per develop-feature's Development phase discipline). A task that finds nothing to change makes no commit.

### Task 1: Bootstrap configs

Create `renovate.json5`, `knip.jsonc`, and `syncpack.config.js` (content above) for each one that doesn't already exist in the repo root. Add to root `package.json`, for each tool not already a devDependency:

```json
"devDependencies": {
  "knip": "6.24.0",
  "madge": "8.0.0",
  "npm-check-updates": "22.2.9",
  "renovate": "43.251.0",
  "syncpack": "15.3.2"
}
```

Resolve the actual current latest version of each with `pnpm view <package> version` rather than reusing these exact numbers verbatim, unless they're still current — they were accurate at the time this skill was built.

Add these scripts to root `package.json`, alongside the existing ones:

```json
"hygiene:deps": "ncu -u --workspaces",
"hygiene:deps:validate-config": "renovate-config-validator renovate.json5",
"hygiene:audit": "pnpm audit",
"hygiene:audit:fix": "pnpm audit --fix=update",
"hygiene:deadcode": "knip",
"hygiene:deadcode:fix": "knip --fix",
"hygiene:versions": "syncpack lint",
"hygiene:versions:fix": "syncpack fix",
"hygiene:cycles": "madge --circular --extensions ts --exclude '(^|/)(node_modules|dist)/' apps packages tools"
```

Run `pnpm install` so the new devDependencies are actually installed. This task makes a commit the first time `code-hygiene` runs in this repo; on every later run it's a no-op (no commit, since the files and scripts already exist).

### Task 2: Dependency updates

```bash
pnpm run hygiene:deps
pnpm install
pnpm run hygiene:deps:validate-config
```

`hygiene:deps` bumps every workspace `package.json` to the latest version satisfying its declared range (and beyond, for majors — `ncu -u` is not range-limited). `pnpm install` refreshes the lockfile against the bumped versions. `hygiene:deps:validate-config` confirms `renovate.json5` — unused by this step, but load-bearing for a future CI run — is still syntactically valid.

Run `pnpm verify`. If it fails: **REQUIRED SUB-SKILL:** Use `superpowers:systematic-debugging`. If the failure isn't a straightforward fix (e.g. a major version bump needs nontrivial migration work), stop and ask the developer whether to fix it, revert just that dependency's bump and continue, or abort the run.

### Task 3: Security audit

```bash
pnpm run hygiene:audit:fix
pnpm run hygiene:audit
```

The first command attempts to update vulnerable packages to non-vulnerable versions within the lockfile (`--fix=update`, not `--fix=override` — `update` doesn't leave permanent `pnpm.overrides` entries in `package.json` behind once the real fix ships upstream). The second re-reports what's left. Run `pnpm verify`. If any vulnerability remains reported, stop and ask the developer how to proceed (accept the risk, find an alternative package, or abort the run) — do not leave it unmentioned or deferred to the PR description.

### Task 4: Unused dependencies / dead code

```bash
pnpm run hygiene:deadcode:fix
pnpm run hygiene:deadcode
```

The first command removes what Knip can safely auto-fix. The second re-reports what's left (Knip can't auto-fix every issue type — e.g. some unused exports need a human judgment call about whether they're a public API). Run `pnpm verify`. If the second command reports any remaining issue, stop and ask the developer how to proceed (delete manually, mark as intentionally kept via `ignore`/`ignoreDependencies` in `knip.jsonc`, or abort the run) — this is a judgment call the skill should not make silently.

### Task 5: Workspace version consistency

```bash
pnpm run hygiene:versions:fix
pnpm run hygiene:versions
```

The first command fixes what syncpack can resolve automatically. The second re-reports what's left (syncpack can't always tell which of several divergent versions across workspaces is "correct"). Run `pnpm verify`. If the second command reports any remaining mismatch, stop and ask the developer which version should win, or how to configure a `versionGroups` entry in `syncpack.config.js` to allow the divergence intentionally.

### Task 6: Circular dependencies

```bash
pnpm run hygiene:cycles
```

Report-only — madge cannot fix a cycle automatically. If it reports any circular dependency, stop and ask the developer how to proceed. Unlike Tasks 3–5, this task never has a "fix" step — any finding here always pauses the run.

### Task 7: Lint

```bash
pnpm lint:fix
```

Run `pnpm verify`. Per this project's existing convention (`CLAUDE.md`), hand-edit only failures `pnpm lint:fix` can't auto-resolve — this is routine mechanical work, not a judgment call, so it is not a stop condition.

### Task 8: Format

```bash
pnpm format:fix
```

Run `pnpm verify`.

## Stop conditions

Any finding a task can't safely auto-fix pauses the run immediately for developer direction, rather than being deferred into the PR description:

- Task 2: a dependency update that breaks `pnpm verify` and isn't a straightforward fix after `systematic-debugging`.
- Task 3: a security vulnerability with no available patched version.
- Task 4: any dead-code/unused-dependency finding Knip couldn't auto-fix.
- Task 5: any version mismatch syncpack couldn't auto-fix.
- Task 6: any circular dependency at all (this check never auto-fixes).

Tasks 7 and 8 have no stop condition — remaining lint/format issues after `--fix` are routine hand-edits per this project's existing convention, not judgment calls.

When paused, report what was found, what's already committed so far in the run, and wait for developer direction (fix manually, skip this item and continue, or abort the run) before resuming.
