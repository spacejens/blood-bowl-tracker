import { existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';

import {
  GITIGNORED_AUTO_CREATE_SYMLINK_DIRS,
  GITIGNORED_DRIFT_FILES,
  GitRootsService,
  ProcessRunnerService,
} from '@blood-bowl-tracker/cli-shared';
import { Injectable } from '@nestjs/common';

import { DriftDiffRedactionService } from './drift-diff-redaction.service';

interface DriftedFile {
  /** Repo-relative path. */
  readonly path: string;
  /**
   * Redacted `diff` output; `<` lines are the main checkout, `>` are the
   * worktree. Secret values are stripped — a changed key is reported by
   * name only.
   */
  readonly diff: string;
}

export interface CheckDriftResult {
  readonly drifted: readonly DriftedFile[];
  /** Repo-relative paths that exist only in the worktree. */
  readonly worktreeOnly: readonly string[];
}

/**
 * Finds gitignored config that would be lost when the worktree is removed:
 * a file whose worktree copy differs from the main checkout's, or one that
 * has no main-checkout counterpart at all. A listed file that is absent from
 * the worktree is not a finding — there is nothing there to lose. Also flags
 * a directory that should be a `sync-gitignored`-managed symlink (currently
 * only `docs/plans`) but is instead a real, worktree-local directory —
 * `sync-gitignored` never overwrites one that already existed. Supplies
 * classification and diff text only; resolving each finding stays in the
 * calling skill. A no-op outside a worktree.
 */
@Injectable()
export class CheckDriftService {
  constructor(
    private readonly gitRoots: GitRootsService,
    private readonly processRunner: ProcessRunnerService,
    private readonly redaction: DriftDiffRedactionService,
  ) {}

  async run(): Promise<CheckDriftResult> {
    const drifted: DriftedFile[] = [];
    const worktreeOnly: string[] = [];

    const roots = await this.gitRoots.resolve();
    if (!roots.isWorktree) {
      return { drifted, worktreeOnly };
    }

    for (const path of GITIGNORED_DRIFT_FILES) {
      const worktreeCopy = join(roots.worktreeRoot, path);
      if (!existsSync(worktreeCopy)) {
        continue;
      }
      const mainCopy = join(roots.mainRoot, path);
      if (!existsSync(mainCopy)) {
        worktreeOnly.push(path);
        continue;
      }
      // `diff` exits 0 when identical and 1 when the files differ; anything
      // higher is a real failure of the diff itself.
      const result = await this.processRunner.run('diff', [
        mainCopy,
        worktreeCopy,
      ]);
      if (result.exitCode > 1) {
        // `diff`'s own stderr only ever carries operational failures (a
        // missing path, a permission error), never file content, so
        // forwarding it unredacted here is safe.
        throw new Error(
          `diff of ${path} failed (exit ${result.exitCode}): ` +
            result.stderr.trim(),
        );
      }
      if (result.exitCode === 1) {
        drifted.push({
          path,
          diff: this.redaction.redact(result.stdout.trimEnd()),
        });
      }
    }

    // `sync-gitignored` never overwrites a worktree path that already
    // exists — if a developer's worktree had its own docs/plans before
    // sync-gitignored ran, it stays a real directory instead of becoming a
    // symlink to the main checkout, and files in it are worktree-only.
    // GITIGNORED_DRIFT_FILES can't cover this: it's a directory, and its
    // "no main-checkout counterpart" test above doesn't apply either, since
    // sync-gitignored's own auto-create step guarantees a main-checkout
    // docs/plans always exists.
    for (const path of GITIGNORED_AUTO_CREATE_SYMLINK_DIRS) {
      const worktreeCopy = join(roots.worktreeRoot, path);
      if (!existsSync(worktreeCopy)) {
        continue;
      }
      if (!lstatSync(worktreeCopy).isSymbolicLink()) {
        worktreeOnly.push(path);
      }
    }

    return { drifted, worktreeOnly };
  }
}
