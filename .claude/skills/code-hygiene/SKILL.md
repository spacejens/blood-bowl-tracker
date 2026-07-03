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

Two of the four tools below read a config file, committed at the repo root: `knip.jsonc` and `syncpack.config.js`. These are living files: a developer may hand-edit them later (e.g. to exclude a dependency from audit/updates, group specific dependencies together, or silence a false-positive dead-code finding), and those edits must persist across future `code-hygiene` runs — this skill never overwrites them.

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

All four tools are already pinned root `devDependencies` with their `hygiene:*` scripts already in root `package.json` — nothing to install or bootstrap; every task below just runs its script.

## Fixed task list (Development phase)

One commit per task, `pnpm verify` after each (per develop-feature's Development phase discipline). A task that finds nothing to change makes no commit.

### Task 1: Dependency updates

```bash
pnpm run hygiene:deps
pnpm install
```

`hygiene:deps` bumps every workspace `package.json` to the latest version satisfying its declared range (and beyond, for majors — `ncu -u` is not range-limited). `pnpm install` refreshes the lockfile against the bumped versions.

Run `pnpm verify`. If it fails: **REQUIRED SUB-SKILL:** Use `superpowers:systematic-debugging`. If the failure isn't a straightforward fix (e.g. a major version bump needs nontrivial migration work), stop and ask the developer whether to fix it, revert just that dependency's bump and continue, or abort the run.

### Task 2: Security audit

```bash
pnpm run hygiene:audit:fix
pnpm run hygiene:audit
```

The first command attempts to update vulnerable packages to non-vulnerable versions within the lockfile (`--fix=update`, not `--fix=override` — `update` doesn't leave permanent `pnpm.overrides` entries in `package.json` behind once the real fix ships upstream). The second re-reports what's left. Run `pnpm verify`. If any vulnerability remains reported, stop and ask the developer how to proceed (accept the risk, find an alternative package, or abort the run) — do not leave it unmentioned or deferred to the PR description.

### Task 3: Unused dependencies / dead code

```bash
pnpm run hygiene:deadcode:fix
pnpm run hygiene:deadcode
```

The first command removes what Knip can safely auto-fix. The second re-reports what's left (Knip can't auto-fix every issue type — e.g. some unused exports need a human judgment call about whether they're a public API). Run `pnpm verify`. If the second command reports any remaining issue, stop and ask the developer how to proceed (delete manually, mark as intentionally kept via `ignore`/`ignoreDependencies` in `knip.jsonc`, or abort the run) — this is a judgment call the skill should not make silently.

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

- Task 1: a dependency update that breaks `pnpm verify` and isn't a straightforward fix after `systematic-debugging`.
- Task 2: a security vulnerability with no available patched version.
- Task 3: any dead-code/unused-dependency finding Knip couldn't auto-fix.
- Task 4: any version mismatch syncpack couldn't auto-fix.
- Task 5: any circular dependency at all (this check never auto-fixes).

Tasks 6 and 7 have no stop condition — remaining lint/format issues after `--fix` are routine hand-edits per this project's existing convention, not judgment calls.

When paused, report what was found, what's already committed so far in the run, and wait for developer direction (fix manually, skip this item and continue, or abort the run) before resuming.
