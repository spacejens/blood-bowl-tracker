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
  /**
   * True only when this attempt's own `git merge` stopped on conflicts — it
   * left `MERGE_HEAD` behind, read before the abort removed it. Always comes
   * with a `failure`. A conflict is not something a review comment can stand
   * in for: the caller has to resolve it.
   */
  readonly conflict?: boolean;
}

/** A git diagnostic line worth reporting ahead of any other stderr line. */
const GIT_ERROR_LINE = /^(fatal|error):/;

/** The conflict check and the abort are cleanup that must still run once the attempt's budget is spent. */
const ABORT_TIMEOUT_MS = 10_000;

/**
 * Asks for a review by merging `origin/main` into the current branch and
 * pushing, for `wait-for-pr-review --trigger-merge-main`. Runs in the
 * process's working directory — the worktree the caller launched the CLI
 * from — like every `gh` call the wait already makes.
 *
 * Never rejects: a review trigger must not abort the wait it belongs to, so
 * every failure becomes a `failure` line the caller reports, and a
 * conflicting merge is additionally flagged (see
 * `MergeRetriggerResult.conflict`).
 */
@Injectable()
export class ReviewRetriggerMergeService {
  constructor(private readonly processRunner: ProcessRunnerService) {}

  /**
   * `timeoutMs` is one budget for the whole attempt: a deadline is fixed when
   * it starts and each git step gets only the time left, so fetch, merge and
   * push together never outlast it. A step that would start after the
   * deadline is not started. The exceptions are the cleanup steps after a
   * failed merge — the conflict check and `git merge --abort` — which each
   * get their own `ABORT_TIMEOUT_MS` and can therefore run past the deadline.
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
   * harmlessly, which keeps this to one failure path. Before that abort it
   * checks for `MERGE_HEAD`: a merge that stopped on conflicts is reported
   * with `conflict: true`, so the caller can resolve it instead of falling
   * back to the comment.
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
      // Not just `main`: the ahead-of-upstream check below needs the branch's
      // own remote ref current, or a push that changes nothing would count as
      // the review trigger.
      await this.git(['fetch', 'origin'], deadline);
      startedMerge = true;
      await this.git(['merge', 'origin/main', '--no-edit'], deadline);
      if ((await this.head(deadline)) === before) {
        return { pushed: await this.pushWhenAhead(deadline) };
      }
      await this.git(['push'], deadline);
      return { pushed: true };
    } catch (error) {
      const failure = this.describe(error);
      if (!startedMerge) {
        return { pushed: false, failure };
      }
      const conflict = await this.conflictLeftBehind();
      await this.abortMerge();
      return conflict
        ? { pushed: false, conflict: true, failure }
        : { pushed: false, failure };
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

  /**
   * Whether the failed attempt left a conflicted merge behind: `MERGE_HEAD`
   * exists only while a merge that stopped on conflicts awaits resolution.
   * A failed push or a budget overrun after the merge finds it gone, since
   * that merge already committed. Gets `ABORT_TIMEOUT_MS` like the abort, as
   * the attempt's own budget may be spent. Best effort: a check that fails
   * or cannot run reads as no conflict.
   */
  private async conflictLeftBehind(): Promise<boolean> {
    try {
      const result = await this.processRunner.run(
        'git',
        ['rev-parse', '-q', '--verify', 'MERGE_HEAD'],
        ABORT_TIMEOUT_MS,
      );
      return result.exitCode === 0;
    } catch {
      return false;
    }
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
