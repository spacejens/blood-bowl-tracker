import {
  ProcessResult,
  ProcessRunnerService,
} from '@blood-bowl-tracker/cli-shared';
import { Injectable } from '@nestjs/common';

/** What one merge-and-push retrigger attempt achieved. */
export interface MergeRetriggerResult {
  /**
   * True only when a push succeeded — the push is itself what asks CodeRabbit
   * for a review. That is a push of the merge's new commit, or of a local
   * merge commit an earlier failed push left behind.
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

/** The abort is cleanup that must still run once the attempt's budget is spent. */
const ABORT_TIMEOUT_MS = 10_000;

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
   * `timeoutMs` is one budget for the whole attempt: a deadline is fixed when
   * it starts and each git step gets only the time left, so fetch, merge and
   * push together never outlast it. A step that would start after the
   * deadline is not started.
   *
   * A merge already in progress in the worktree is not this service's to
   * touch: it reports a failure and leaves that state alone.
   *
   * HEAD is read before and after the merge: an unchanged HEAD means the
   * branch already contained `main`. The branch may still hold a local merge
   * commit whose earlier push failed, so an unchanged HEAD pushes when the
   * branch is ahead of its upstream, and otherwise leaves the caller to
   * comment instead.
   *
   * Once this attempt has started its own merge, any failure attempts
   * `git merge --abort`. Only a failed merge actually leaves one in
   * progress; after a failed push the abort finds nothing to undo and fails
   * harmlessly, which keeps this to one failure path.
   */
  async mergeMainAndPush(timeoutMs: number): Promise<MergeRetriggerResult> {
    const deadline = Date.now() + timeoutMs;
    let startedMerge = false;
    try {
      if (await this.mergeInProgress(deadline)) {
        return {
          pushed: false,
          failure:
            'a merge is already in progress in this worktree; left untouched',
        };
      }
      const before = await this.head(deadline);
      await this.git(['fetch', 'origin', 'main'], deadline);
      startedMerge = true;
      await this.git(['merge', 'origin/main', '--no-edit'], deadline);
      if ((await this.head(deadline)) === before) {
        return { pushed: await this.pushWhenAhead(deadline) };
      }
      await this.git(['push'], deadline);
      return { pushed: true };
    } catch (error) {
      if (startedMerge) {
        await this.abortMerge();
      }
      return { pushed: false, failure: this.describe(error) };
    }
  }

  /** Whether the worktree is mid-merge, which `MERGE_HEAD` existing tells. */
  private async mergeInProgress(deadline: number): Promise<boolean> {
    const args = ['rev-parse', '-q', '--verify', 'MERGE_HEAD'];
    const result = await this.run(args, deadline);
    if (result.exitCode === 0) {
      return true;
    }
    if (result.exitCode === 1) {
      return false;
    }
    throw new Error(`git ${args.join(' ')} failed: ${this.reason(result)}`);
  }

  /** Pushes commits the upstream lacks; true only when it pushed. */
  private async pushWhenAhead(deadline: number): Promise<boolean> {
    const ahead = await this.git(
      ['rev-list', '--count', '@{upstream}..HEAD'],
      deadline,
    );
    if (ahead.stdout.trim() === '0') {
      return false;
    }
    await this.git(['push'], deadline);
    return true;
  }

  /** The current commit's SHA, read to tell a merge that added a commit from a no-op. */
  private async head(deadline: number): Promise<string> {
    const result = await this.git(['rev-parse', 'HEAD'], deadline);
    return result.stdout.trim();
  }

  /** One git step; throws an `Error` whose message is the one-line failure. */
  private async git(
    args: readonly string[],
    deadline: number,
  ): Promise<ProcessResult> {
    const result = await this.run(args, deadline);
    if (result.exitCode !== 0) {
      throw new Error(`git ${args.join(' ')} failed: ${this.reason(result)}`);
    }
    return result;
  }

  /** Runs git with the time left before `deadline`; a spent budget or a spawn failure throws the one-line failure. */
  private async run(
    args: readonly string[],
    deadline: number,
  ): Promise<ProcessResult> {
    const step = `git ${args.join(' ')}`;
    const left = deadline - Date.now();
    if (left <= 0) {
      throw new Error(`${step} not started: the time budget is spent`);
    }
    try {
      return await this.processRunner.run('git', args, left);
    } catch (error) {
      throw new Error(`${step} failed: ${this.describe(error)}`, {
        cause: error,
      });
    }
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

  /** The non-blank lines of `text`, each trimmed. */
  private lines(text: string): string[] {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
  }

  /** A thrown value as a one-line message, whether or not it is an `Error`. */
  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /** Best effort: a failed abort must not mask the failure being reported. */
  private async abortMerge(): Promise<void> {
    try {
      await this.processRunner.run(
        'git',
        ['merge', '--abort'],
        ABORT_TIMEOUT_MS,
      );
    } catch {
      // Nothing to do — see above.
    }
  }
}
