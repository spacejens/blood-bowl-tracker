import { ProcessRunnerService } from '@blood-bowl-tracker/cli-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockProxy } from 'vitest-mock-extended';

import { ReviewRetriggerMergeService } from './review-retrigger-merge.service';
import {
  WaitForPrReviewOptions,
  WaitForPrReviewService,
} from './wait-for-pr-review.service';
import {
  createHarness,
  EMPTY,
  FOUND,
  OPTIONS,
  RATE_LIMITED,
  REVIEW,
  rollingResult,
  STAR_GATED,
} from './wait-for-pr-review.test-helpers';

/**
 * `--trigger-merge-main` turns the caller-requested trigger into a merge of
 * `main` plus a push, keeping the review comment only as the fallback for a
 * no-op or failed merge. The star-gate trigger is not a rate-limit wait and
 * always comments.
 */
describe('WaitForPrReviewService merge-main retrigger', () => {
  let service: WaitForPrReviewService;
  let processRunner: MockProxy<ProcessRunnerService>;
  let retriggerMerge: MockProxy<ReviewRetriggerMergeService>;

  beforeEach(async () => {
    vi.useFakeTimers();
    ({ service, processRunner, retriggerMerge } = await createHarness());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  type RunResult = Awaited<ReturnType<ProcessRunnerService['run']>>;

  /**
   * Answers each `gh pr view` poll from `prViews` in order (the last entry
   * repeats), every `gh api .../comments` call with no match, and every
   * `gh pr comment` post with success.
   */
  function mockPolls(...prViews: RunResult[]) {
    let index = 0;
    processRunner.run.mockImplementation((_command, args) => {
      if (args[1] === 'comment') {
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      }
      if (args[0] === 'api') {
        return Promise.resolve(rollingResult({}));
      }
      const result = prViews[Math.min(index, prViews.length - 1)];
      index += 1;
      return Promise.resolve(result);
    });
  }

  /** The `gh pr comment` trigger posts' args. */
  function commentPosts(): (readonly string[])[] {
    return processRunner.run.mock.calls
      .filter((call) => call[1][1] === 'comment')
      .map((call) => call[1]);
  }

  /** A due trigger with the merge flag set, unless overridden. */
  function options(
    overrides: Partial<WaitForPrReviewOptions> = {},
  ): WaitForPrReviewOptions {
    return {
      ...OPTIONS,
      triggerAfterEpochSeconds: Math.floor(Date.now() / 1000),
      triggerMergeMain: true,
      timeoutMs: 120_000,
      intervalMs: 30_000,
      ...overrides,
    };
  }

  async function runWait(waitOptions: WaitForPrReviewOptions) {
    const pending = service.run(waitOptions);
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    return pending;
  }

  it('pushes the merge instead of commenting when it creates a commit', async () => {
    mockPolls(EMPTY);
    retriggerMerge.mergeMainAndPush.mockResolvedValue({ pushed: true });

    const result = await runWait(options());

    expect(retriggerMerge.mergeMainAndPush).toHaveBeenCalledTimes(1);
    expect(retriggerMerge.mergeMainAndPush).toHaveBeenCalledWith(120_000);
    expect(commentPosts()).toHaveLength(0);
    expect(result).toEqual({
      found: false,
      timedOut: true,
      retrigger: { method: 'merge-push' },
    });
  });

  it('comments when the merge brought in nothing new', async () => {
    mockPolls(EMPTY);
    retriggerMerge.mergeMainAndPush.mockResolvedValue({ pushed: false });

    const result = await runWait(options());

    expect(commentPosts()).toEqual([
      ['pr', 'comment', '392', '--body', '@coderabbitai review'],
    ]);
    expect(result).toEqual({
      found: false,
      timedOut: true,
      retrigger: { method: 'comment' },
    });
  });

  it('comments and reports the failure when the merge failed', async () => {
    mockPolls(EMPTY);
    const failure =
      'git merge origin/main --no-edit failed: Automatic merge failed; fix conflicts and then commit the result.';
    retriggerMerge.mergeMainAndPush.mockResolvedValue({
      pushed: false,
      failure,
    });

    const result = await runWait(options());

    expect(commentPosts()).toHaveLength(1);
    expect(result).toEqual({
      found: false,
      timedOut: true,
      retrigger: { method: 'comment', mergeFailure: failure },
    });
  });

  it('reports the retrigger alongside a review found after the push', async () => {
    mockPolls(EMPTY, FOUND);
    retriggerMerge.mergeMainAndPush.mockResolvedValue({ pushed: true });

    const result = await runWait(options());

    expect(result).toEqual({
      found: true,
      review: REVIEW,
      retrigger: { method: 'merge-push' },
    });
  });

  it('reports the retrigger alongside a fresh rate limit after the push', async () => {
    mockPolls(RATE_LIMITED);
    retriggerMerge.mergeMainAndPush.mockResolvedValue({ pushed: true });

    const result = await runWait(options());

    expect(retriggerMerge.mergeMainAndPush).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      found: false,
      rateLimited: true,
      retrigger: { method: 'merge-push' },
    });
  });

  it('comments and never merges without the flag', async () => {
    mockPolls(EMPTY);

    const result = await runWait(options({ triggerMergeMain: false }));

    expect(retriggerMerge.mergeMainAndPush).not.toHaveBeenCalled();
    expect(commentPosts()).toHaveLength(1);
    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('comments for a star-gate trigger even with the flag set', async () => {
    mockPolls(STAR_GATED, EMPTY);

    const result = await runWait(
      options({
        triggerAfterEpochSeconds: Math.floor(Date.now() / 1000) + 3600,
      }),
    );

    expect(retriggerMerge.mergeMainAndPush).not.toHaveBeenCalled();
    expect(commentPosts()).toHaveLength(1);
    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('reports no retrigger when the trigger instant is never reached', async () => {
    mockPolls(EMPTY);

    const result = await runWait(
      options({
        triggerAfterEpochSeconds: Math.floor(Date.now() / 1000) + 3600,
      }),
    );

    expect(retriggerMerge.mergeMainAndPush).not.toHaveBeenCalled();
    expect(commentPosts()).toHaveLength(0);
    expect(result).toEqual({ found: false, timedOut: true });
  });
});
