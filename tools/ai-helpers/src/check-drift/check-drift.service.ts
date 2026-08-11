import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

import { GitRootsService } from '../shared/git-roots.service';
import { GITIGNORED_DRIFT_FILES } from '../shared/gitignored-files';
import { ProcessRunnerService } from '../shared/process-runner.service';

interface DriftedFile {
  /** Repo-relative path. */
  readonly path: string;
  /** `diff` output; `<` lines are the main checkout, `>` are the worktree. */
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
 * the worktree is not a finding — there is nothing there to lose. Supplies
 * classification and diff text only; resolving each finding stays in the
 * calling skill. A no-op outside a worktree.
 */
@Injectable()
export class CheckDriftService {
  constructor(
    private readonly gitRoots: GitRootsService,
    private readonly processRunner: ProcessRunnerService,
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
        throw new Error(
          `diff of ${path} failed (exit ${result.exitCode}): ` +
            result.stderr.trim(),
        );
      }
      if (result.exitCode === 1) {
        drifted.push({ path, diff: result.stdout.trimEnd() });
      }
    }

    return { drifted, worktreeOnly };
  }
}
