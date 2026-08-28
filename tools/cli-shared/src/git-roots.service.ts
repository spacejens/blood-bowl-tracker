import { dirname } from 'node:path';

import { Injectable } from '@nestjs/common';

import { ProcessRunnerService } from './process-runner.service';

/** Where this process is running, relative to the repo's main checkout. */
export interface GitRoots {
  /** Absolute path to the repository's main (primary) checkout. */
  readonly mainRoot: string;
  /** Absolute path to the checkout this process is running in. */
  readonly worktreeRoot: string;
  /** True when `worktreeRoot` is a linked worktree, not the main checkout. */
  readonly isWorktree: boolean;
}

/**
 * Resolves the main-checkout / worktree pair. Shared library plumbing
 * consumed by multiple CLI packages — not tied to any single subcommand.
 */
@Injectable()
export class GitRootsService {
  constructor(private readonly processRunner: ProcessRunnerService) {}

  async resolve(): Promise<GitRoots> {
    // `--git-common-dir` points at the MAIN checkout's .git directory even
    // from inside a linked worktree, so its parent is the main checkout root.
    const commonDir = await this.git([
      'rev-parse',
      '--path-format=absolute',
      '--git-common-dir',
    ]);
    const worktreeRoot = await this.git(['rev-parse', '--show-toplevel']);
    const mainRoot = dirname(commonDir);

    return { mainRoot, worktreeRoot, isWorktree: mainRoot !== worktreeRoot };
  }

  private async git(args: readonly string[]): Promise<string> {
    const result = await this.processRunner.run('git', args);
    if (result.exitCode !== 0) {
      throw new Error(
        `git ${args.join(' ')} failed (exit ${result.exitCode}): ` +
          result.stderr.trim(),
      );
    }
    return result.stdout.trim();
  }
}
