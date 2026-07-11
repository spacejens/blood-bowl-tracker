---
name: code-hygiene
description: Use for an on-demand dependency and code hygiene pass in the blood-bowl-tracker project — updates dependencies, removes unused dependencies and dead code, fixes dependencies that should be devDependencies, runs a security audit, fixes workspace version mismatches, checks for circular dependencies, and fixes lint/formatting, opening a single PR with the results
---

# code-hygiene

Runs a fixed set of dependency and code hygiene checks — dependency updates, unused dependency/dead code removal, dependency placement (dependencies vs. devDependencies), a security audit, workspace version consistency, circular dependency detection, lint, and format — and opens a single pull request with the results. Unlike `develop-feature`, there is no specification or planning step: the checks and their order are fixed every run.

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

- **Development:** execute the fixed task list below instead of a written plan. Otherwise identical — one commit per completed task (except Task 2, which commits per dependency group — see below), `pnpm verify` after each, `superpowers:test-driven-development` and `superpowers:systematic-debugging` apply exactly as develop-feature's Development phase describes when a task involves writing or fixing code.
- **Self-review:** identical to develop-feature's Self-review phase.
- **Integration:** identical to develop-feature's Integration phase, except the PR:
  ```bash
  gh pr create \
    --title "Code hygiene: <YYYY-MM-DD>" \
    --body "$(cat <<'EOF'
  ## Summary
  <one bullet per task or dependency group that made a commit, summarizing what changed>
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

All four tools are already pinned root `devDependencies` with their `hygiene:*` scripts already in root `package.json` — nothing to install or bootstrap; every task below that uses one of these tools just runs its script (Task 1 is the exception — it uses `npm view` directly, not a `hygiene:*` script).

## Fixed task list (Development phase)

One commit per task, `pnpm verify` after each (per develop-feature's Development phase discipline) — except Task 2 (Dependency updates), which produces one commit per dependency group instead of one commit for the whole task (see below). A task (or dependency group) that finds nothing to change makes no commit.

### Task 1: Minimum release age exclude pruning

`pnpm-workspace.yaml` may carry a `minimumReleaseAgeExclude` list — entries that exempt specific `name@version` pairs from the `minimumReleaseAge` policy (see the `minimumReleaseAge` key in the same file) because, at the time they were added, that exact version hadn't yet reached the minimum age. Entries become unnecessary once enough time passes, and this list has no other mechanism to shrink — this task is that mechanism. If `minimumReleaseAgeExclude` is absent or empty, this task finds nothing to do — no commit, move to Task 2.

For each `name@version` entry in the list:

```bash
npm view "<name>" time --json | node -e "
  const data = JSON.parse(require('fs').readFileSync(0, 'utf8'));
  const version = process.argv[1];
  const published = new Date(data[version]);
  const ageMinutes = (Date.now() - published.getTime()) / 60000;
  console.log(version, published.toISOString(), 'age_minutes=' + Math.round(ageMinutes));
" "<version>"
```

Compare the reported `age_minutes` against the `minimumReleaseAge` value (minutes) in `pnpm-workspace.yaml`:

- **age_minutes >= minimumReleaseAge** — the entry is old enough now that the policy would allow it anyway; drop it from the list.
- **age_minutes < minimumReleaseAge** — still genuinely too new; keep the entry as-is.

This is a purely mechanical numeric comparison — never a judgment call, so it has no stop condition (see Stop conditions below).

If any entries were dropped, run `pnpm install` (refreshes the lockfile; expect no diff, since dropping an exclude entry doesn't change what's already resolved), then `pnpm verify`, then commit — message noting which entries were removed and why (e.g. "Prune minimumReleaseAgeExclude: drop entries older than 24 hours"). If nothing was dropped, no commit.

### Task 2: Dependency updates

Unlike Tasks 1 and 3–8, this task does not produce a single commit — it produces one commit per dependency update (or tightly-coupled group of updates), so a `pnpm verify` failure is always traceable to exactly one change. Work through the steps below in order.

**1. Enumerate outdated dependencies.**

```bash
pnpm run hygiene:deps:list
```

This reports every outdated dependency, per workspace `package.json` (including the root), classified as Patch / Minor / Major. Build a to-do list of *groups* from this output:

- Default: one group per dependency name, spanning every workspace that declares it (e.g. if `typescript` is outdated in five workspaces, that's one group covering all five).
- Exception — bundle multiple dependency names into one group when they're a known coordinated release train that must share a version, e.g. all `@nestjs/*` packages together, or `vitest` with `@vitest/coverage-v8`.
- Manually-tracked non-npm group — the SchemaSpy Docker image tag pinned in `tools/db-diagram.sh` (the `SCHEMASPY_VERSION` variable). `ncu` cannot see this Docker tag, so check it directly here. Fetch the latest release:
  ```bash
  gh api repos/schemaspy/schemaspy/releases/latest --jq .tag_name
  ```
  This returns a `v`-prefixed tag (e.g. `v7.0.2`), while `SCHEMASPY_VERSION` in `tools/db-diagram.sh` is pinned *without* the `v` prefix (e.g. `7.0.2`, matching the actual `schemaspy/schemaspy` Docker Hub tag naming) — strip the leading `v` before comparing the two. If the latest release is newer, add it as its own group to the to-do list, tiered by the same patch/minor/major convention as the npm groups (major only when the SchemaSpy major version changes, e.g. `7.x` → `8.x`; otherwise minor or patch by which component of the version moved). Applying this group means editing the `SCHEMASPY_VERSION` value in `tools/db-diagram.sh` to the new version *without* the `v` prefix, then running `pnpm verify` and committing per step 3's per-group process (one commit per group, ordered patch → minor → major, same failure handling). Note that `tools/db-diagram.sh` has no unit test and is not exercised by `pnpm verify`, so a passing `pnpm verify` only confirms nothing else broke; the script's real check is running `pnpm run db:diagram` against a running local stack, which a version-only tag bump does not block.

**2. Order the groups.**

Process patch-tier groups first, then minor, then major; alphabetically by dependency/group name within each tier. A bundled group takes the tier of its riskiest member. This lands low-risk wins as clean commits early and isolates the updates most likely to need migration work (majors) at the end, so a stop there doesn't block everything else.

**3. Apply each group, in order:**

```bash
pnpm run hygiene:deps -- -f "<name>[,<name2>,...]"
pnpm install
```

(`-f` accepts a comma-separated list — a single name for a plain group, several for a bundled one.) This bumps just this group's entries to the latest version satisfying its declared range (and beyond, for majors — `ncu -u` is not range-limited), across every workspace that declares it, then refreshes the lockfile.

If this group has no actual version change left to apply (e.g. it was already resolved while handling an earlier bundled group), skip it — no commit.

Run `pnpm verify`. If it passes, commit — message in this repo's plain style, no `chore:`/conventional-commit prefix (e.g. "Update typescript to v6" or "Update vitest and @vitest/coverage-v8 to v4") — and move to the next group.

If it fails: **REQUIRED SUB-SKILL:** Use `superpowers:systematic-debugging` to diagnose, then:

- **Peer-dependency conflict** naming another currently-outdated dependency not yet in this group — merge that dependency into this group and retry from the top of step 3.
- **Mechanical migration** needed (renamed API/config, codemod-style changes to match the new version) — make the fix now, as part of this same commit. This is expected, routine work for a major bump, not a reason to stop.
- **Judgment call** needed (the fix isn't mechanical — it requires a product or architecture decision) — stop. Report which groups already committed this run, then ask the developer whether to fix it manually and resume, skip this dependency and continue with the rest of the to-do list, or abort the run. Commits already made are not rolled back.

### Task 3: Security audit

```bash
pnpm run hygiene:audit:fix
pnpm run hygiene:audit
```

The first command attempts to update vulnerable packages to non-vulnerable versions within the lockfile (`--fix=update`, not `--fix=override` — `update` doesn't leave permanent `pnpm.overrides` entries in `package.json` behind once the real fix ships upstream). The second re-reports what's left. Run `pnpm verify`. If any vulnerability remains reported, stop and ask the developer how to proceed (accept the risk, find an alternative package, or abort the run) — do not leave it unmentioned or deferred to the PR description.

### Task 4: Unused dependencies / dead code / dependency placement

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

- Task 1: none — pruning is a purely mechanical age comparison, never a judgment call.
- Task 2: a dependency group's `pnpm verify` failure that needs a judgment call to resolve (not just mechanical migration) after `systematic-debugging` — see Task 2 above for the full per-group workflow. Commits already made earlier in the run are kept, not rolled back.
- Task 3: a security vulnerability with no available patched version.
- Task 4: any dead-code/unused-dependency finding Knip couldn't auto-fix, or any dependency-placement candidate whose dev-only-vs-production-need status can't be confidently determined after investigation.
- Task 5: any version mismatch syncpack couldn't auto-fix.
- Task 6: any circular dependency at all (this check never auto-fixes).

Tasks 1, 7, and 8 have no stop condition — Task 1's pruning is purely mechanical (see above), and remaining lint/format issues in Tasks 7–8 after `--fix` are routine hand-edits per this project's existing convention, not judgment calls.

When paused, report what was found, what's already committed so far in the run, and wait for developer direction (fix manually, skip this item and continue, or abort the run) before resuming.
