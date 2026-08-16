import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockProxy } from 'vitest-mock-extended';

import { ProcessRunnerService } from '../shared/process-runner.service';
import { PullRequestReviewCommentsService } from './pull-request-review-comments.service';
import { WaitForPrReviewService } from './wait-for-pr-review.service';
import {
  createHarness,
  EMPTY_BODY_FOUND,
  EMPTY_BODY_REVIEW,
  FOUND,
  OPTIONS,
  REVIEW,
  rollingResult,
} from './wait-for-pr-review.test-helpers';

describe('WaitForPrReviewService empty-body artifact reviews', () => {
  let service: WaitForPrReviewService;
  let processRunner: MockProxy<ProcessRunnerService>;
  let reviewComments: MockProxy<PullRequestReviewCommentsService>;

  beforeEach(async () => {
    vi.useFakeTimers();
    ({ service, processRunner, reviewComments } = await createHarness());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Runs the wait to completion under fake timers: the returned promise only
   * settles once enough timer time has been advanced, so the advancing has to
   * happen while the wait is still pending rather than after an `await`.
   */
  async function runWait(
    options: Parameters<WaitForPrReviewService['run']>[0],
    advanceMs = 15 * 60 * 1000,
  ): Promise<Awaited<ReturnType<WaitForPrReviewService['run']>>> {
    const pending = service.run(options);
    await vi.advanceTimersByTimeAsync(advanceMs);
    return pending;
  }

  /**
   * Routes the two `gh` calls one poll can make: `gh pr view` (formal review
   * + rate-limit comment) and `gh api repos/.../comments` (rolling comment).
   * Every poll answers the same way, so this models a steady state.
   */
  function mockPoll(
    prView: Awaited<ReturnType<ProcessRunnerService['run']>>,
    comments: Awaited<ReturnType<ProcessRunnerService['run']>>,
  ) {
    processRunner.run.mockImplementation((_command, args) =>
      Promise.resolve(args[0] === 'api' ? comments : prView),
    );
  }

  it('still reports an empty-body review that carries inline comments', async () => {
    mockPoll(EMPTY_BODY_FOUND, rollingResult({}));
    reviewComments.hasInlineComments.mockResolvedValue(true);

    const result = await runWait(OPTIONS);

    expect(result).toEqual({ found: true, review: EMPTY_BODY_REVIEW });
    expect(reviewComments.hasInlineComments).toHaveBeenCalledWith(
      'PRR_empty1',
      expect.any(Number),
    );
  });

  it('discards an empty-body review with no inline comments', async () => {
    mockPoll(EMPTY_BODY_FOUND, rollingResult({}));
    reviewComments.hasInlineComments.mockResolvedValue(false);

    const result = await runWait({
      ...OPTIONS,
      timeoutMs: 60_000,
      intervalMs: 30_000,
    });

    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('discards an empty-body review when the comment lookup itself fails', async () => {
    mockPoll(EMPTY_BODY_FOUND, rollingResult({}));
    reviewComments.hasInlineComments.mockResolvedValue(undefined);

    const result = await runWait({
      ...OPTIONS,
      timeoutMs: 60_000,
      intervalMs: 30_000,
    });

    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('never looks up inline comments for a review that has a body', async () => {
    processRunner.run.mockResolvedValue(FOUND);

    const result = await runWait(OPTIONS);

    expect(result).toEqual({ found: true, review: REVIEW });
    expect(reviewComments.hasInlineComments).not.toHaveBeenCalled();
  });

  it('keeps polling the rolling comment after discarding an artifact review', async () => {
    mockPoll(EMPTY_BODY_FOUND, rollingResult({}));
    reviewComments.hasInlineComments.mockResolvedValue(false);

    await runWait({ ...OPTIONS, timeoutMs: 30_000, intervalMs: 30_000 });

    // A discarded review must behave exactly like "nothing found yet": the
    // poll falls through to the rolling-comment `gh api` call instead of
    // returning early.
    const apiCalls = processRunner.run.mock.calls.filter(
      ([, args]) => args[0] === 'api',
    );
    expect(apiCalls.length).toBeGreaterThan(0);
  });
});
