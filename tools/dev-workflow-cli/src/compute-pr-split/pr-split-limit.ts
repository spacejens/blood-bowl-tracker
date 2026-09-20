/**
 * The largest number of changed files a single PR may carry and still be
 * reviewed reliably. CodeRabbit's own documented limit on this repo's plan is
 * 150 files (it refuses with "Too many files!" above that); this is a
 * deliberate safety margin below it, so a small self-review fix commit made
 * after the check cannot tip a borderline PR over the real limit. It is
 * defined here once so retuning it — for a changed CodeRabbit limit or plan —
 * is a one-line edit with no prose to hunt down.
 */
export const CODERABBIT_SAFE_FILE_LIMIT = 130;

/**
 * Pathspec arguments appended to every `git diff --name-only` in this
 * subcommand. `pnpm-lock.yaml` is excluded because CodeRabbit ignores it by
 * default and does not count it towards its own file limit, so counting it
 * here would split PRs that never needed splitting.
 *
 * Both entries are anchored to the repository root with the `top` magic
 * word regardless of the process's current working directory — unlike a
 * bare `.` or `pnpm-lock.yaml`, either of which is cwd-relative and would
 * silently miscount files if this were ever run from a subdirectory instead
 * of the repo root: the inclusion side would undercount (failing in the
 * unsafe direction: no split when one is actually needed), and the
 * exclusion side would fail to exclude the real root lockfile, counting it
 * in (failing in the safe direction: an unnecessary split).
 */
export const PR_SPLIT_DIFF_PATHSPECS = [
  ':(top)',
  ':(top,exclude)pnpm-lock.yaml',
] as const;
