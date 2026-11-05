import {
  ProcessResult,
  ProcessRunnerService,
} from '@blood-bowl-tracker/cli-shared';
import { Injectable } from '@nestjs/common';

/** What one merge-and-push retrigger attempt achieved. */
export interface MergeRetriggerResult {
  /**
   * True only when the merge created a new commit and `git push` succeeded —
   * the push is itself what asks CodeRabbit for a review.
   */
  readonly pushed: boolean;
  /**
   * One line naming the git step that failed and why. Absent on success and
   * on an up-to-date merge, which is a normal outcome, not a failure.
   */
  readonly failure?: string;
}

/** A git diagnostic line worth reporting ahead of any other stderr line. */
const GIT_ERROR_LINE = /^(fatal|error):/;

/**
 * Asks for a review by merging `origin/main` into the current branch and
 * pushing, for `wait-for-pr-review --trigger-merge-main`. Runs in the
 * process's working directory — the worktree the caller launched the CLI
 * from — like every `gh` call the wait already makes.
 *
 * Never rejects: a review trigger must not abort the wait it belongs to, so
 * every failure becomes a `failure` line the caller reports while falling
 * back to the review comment.
 */
@Injectable()
export class ReviewRetriggerMergeService {
  constructor(private readonly processRunner: ProcessRunnerService) {}

  /**
   * HEAD is read before and after the merge: an unchanged HEAD means the
   * branch already contained `main`, so there is nothing to push and the
   * caller should comment instead.
   *
   * On any failure `git merge --abort` is attempted, whichever step failed.
   * Only a failed merge actually leaves one in progress; for the other steps
   * the abort finds nothing to undo and fails harmlessly, which keeps this
   * to one failure path rather than tracking which step started a merge.
   */
  async mergeMainAndPush(timeoutMs: number): Promise<MergeRetriggerResult> {
    try {
      const before = await this.head(timeoutMs);
      await this.git(['fetch', 'origin', 'main'], timeoutMs);
      await this.git(['merge', 'origin/main', '--no-edit'], timeoutMs);
      if ((await this.head(timeoutMs)) === before) {
        return { pushed: false };
      }
      await this.git(['push'], timeoutMs);
      return { pushed: true };
    } catch (error) {
      await this.abortMerge(timeoutMs);
      return { pushed: false, failure: this.describe(error) };
    }
  }

  private async head(timeoutMs: number): Promise<string> {
    const result = await this.git(['rev-parse', 'HEAD'], timeoutMs);
    return result.stdout.trim();
  }

  /** One git step; throws an `Error` whose message is the one-line failure. */
  private async git(
    args: readonly string[],
    timeoutMs: number,
  ): Promise<ProcessResult> {
    const step = `git ${args.join(' ')}`;
    let result: ProcessResult;
    try {
      result = await this.processRunner.run('git', args, timeoutMs);
    } catch (error) {
      throw new Error(`${step} failed: ${this.describe(error)}`, {
        cause: error,
      });
    }
    if (result.exitCode !== 0) {
      throw new Error(`${step} failed: ${this.reason(result)}`);
    }
    return result;
  }

  /**
   * The most telling line of a failed step: a `fatal:`/`error:` stderr line,
   * else the first stderr line, else the last stdout line (where
   * `git merge` puts its "Automatic merge failed" summary), else the exit
   * code.
   */
  private reason(result: ProcessResult): string {
    const stderr = this.lines(result.stderr);
    return (
      stderr.find((line) => GIT_ERROR_LINE.test(line)) ??
      stderr[0] ??
      this.lines(result.stdout).at(-1) ??
      `exit code ${result.exitCode}`
    );
  }

  private lines(text: string): string[] {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /** Best effort: a failed abort must not mask the failure being reported. */
  private async abortMerge(timeoutMs: number): Promise<void> {
    try {
      await this.processRunner.run('git', ['merge', '--abort'], timeoutMs);
    } catch {
      // Nothing to do — see above.
    }
  }
}
