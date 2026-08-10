import { Injectable } from '@nestjs/common';

import { GitRootsService } from '../shared/git-roots.service';
import { ProcessRunnerService } from '../shared/process-runner.service';

/** One commit present on the main checkout but not on its upstream. */
export interface StrayCommit {
  readonly sha: string;
  readonly subject: string;
}

/** One uncommitted entry from `git status --porcelain` in the main checkout. */
export interface UncommittedFile {
  /** Raw 2-character porcelain status code, e.g. `" M"`, `"??"`, `"A "`. */
  readonly status: string;
  readonly path: string;
}

export interface CheckMainStrayResult {
  readonly isWorktree: boolean;
  /** Omitted entirely when not running in a worktree. */
  readonly uncommittedFiles?: readonly UncommittedFile[];
  /** Omitted entirely when not running in a worktree. */
  readonly strayCommits?: readonly StrayCommit[];
}

/**
 * Reports work accidentally left in the repo's main checkout — the usual
 * cause being a subagent that dropped its `cd <worktree>` prefix. Supplies
 * raw structured data only; classifying each item as "already part of this
 * worktree's work" vs. "provenance unclear" stays a judgment call in the
 * calling skill.
 */
@Injectable()
export class CheckMainStrayService {
  constructor(
    private readonly gitRoots: GitRootsService,
    private readonly processRunner: ProcessRunnerService,
  ) {}

  async run(): Promise<CheckMainStrayResult> {
    const roots = await this.gitRoots.resolve();
    if (!roots.isWorktree) {
      return { isWorktree: false };
    }

    const status = await this.processRunner.run('git', [
      '-C',
      roots.mainRoot,
      'status',
      '--porcelain',
    ]);
    if (status.exitCode !== 0) {
      throw new Error(
        `git status in ${roots.mainRoot} failed (exit ${status.exitCode}): ` +
          status.stderr.trim(),
      );
    }

    // A non-zero exit here means the branch has no upstream to compare
    // against, which is "no stray commits", not an error.
    const log = await this.processRunner.run('git', [
      '-C',
      roots.mainRoot,
      'log',
      '--oneline',
      '@{u}..HEAD',
    ]);

    return {
      isWorktree: true,
      uncommittedFiles: this.parseStatus(status.stdout),
      strayCommits: log.exitCode === 0 ? this.parseLog(log.stdout) : [],
    };
  }

  private parseStatus(stdout: string): readonly UncommittedFile[] {
    return this.lines(stdout).map((line) => ({
      status: line.slice(0, 2),
      path: line.slice(3).trim(),
    }));
  }

  private parseLog(stdout: string): readonly StrayCommit[] {
    return this.lines(stdout).map((line) => {
      const separator = line.indexOf(' ');
      return separator === -1
        ? { sha: line, subject: '' }
        : {
            sha: line.slice(0, separator),
            subject: line.slice(separator + 1),
          };
    });
  }

  private lines(stdout: string): readonly string[] {
    return stdout.split('\n').filter((line) => line.trim() !== '');
  }
}
