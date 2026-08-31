import { ProcessRunnerService } from '@blood-bowl-tracker/cli-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockProxy } from 'vitest-mock-extended';

import { PullRequestReviewCommentsService } from './pull-request-review-comments.service';
import { WaitForPrReviewService } from './wait-for-pr-review.service';
import {
  COMMENT_UPDATE_FAILED,
  COMPLETION_CANDIDATE,
  completionResult,
  COMPLETION_REVIEW,
  createHarness,
  EMPTY_BODY_FOUND,
  OPTIONS,
  RATE_LIMIT_EDIT_CANDIDATE,
  RATE_LIMIT_EDIT_SECTION,
  RATE_LIMITED,
  rateLimitEditResult,
  STAR_GATED,
} from './wait-for-pr-review.test-helpers';

/**
 * The reviews call and the rolling-comment call can each match something in
 * the same poll. Only a review with real body content is trustworthy enough
 * to end the poll on the spot: every other reviews-call match is either a
 * formally-valid-but-content-free artifact, or a CodeRabbit-specific comment
 * that a fresher, head-commit-verified rolling-comment signal should
 * outrank. These tests pin that ordering.
 */
describe('WaitForPrReviewService rolling-comment precedence', () => {
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
   * Routes the two `gh` calls one poll can make: `gh pr view` (formal review
   * plus the three CodeRabbit comment halves) and `gh api repos/.../comments`
   * (the rolling walkthrough comment). Every poll answers the same way, so
   * this models a steady state rather than a sequence.
   */
  function mockPoll(
    prView: Awaited<ReturnType<ProcessRunnerService['run']>>,
    comments: Awaited<ReturnType<ProcessRunnerService['run']>>,
  ) {
    processRunner.run.mockImplementation((_command, args) =>
      Promise.resolve(args[0] === 'api' ? comments : prView),
    );
  }

  /**
   * Runs the wait to completion under fake timers: the returned promise only
   * settles once enough timer time has been advanced, so the advancing has to
   * happen while the wait is still pending rather than after an `await`.
   */
  async function runWait(
    options: Parameters<WaitForPrReviewService['run']>[0],
  ): Promise<Awaited<ReturnType<WaitForPrReviewService['run']>>> {
    const pending = service.run(options);
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    return pending;
  }

  /** The `gh pr comment` trigger posts. */
  function triggerCalls() {
    return processRunner.run.mock.calls.filter(
      (call) => call[1][1] === 'comment',
    );
  }

  it('reports a concurrent rolling rate-limit edit over an empty-body review that only carries inline comments', async () => {
    // An inline-comment reply posted through the API attaches to a review
    // object with an empty top-level body, so the inline-comment check
    // accepts it — but it is not evidence CodeRabbit's own pass ran, and a
    // rate limit edited into the rolling comment in the same window is.
    mockPoll(EMPTY_BODY_FOUND, rateLimitEditResult(RATE_LIMIT_EDIT_CANDIDATE));
    reviewComments.hasInlineComments.mockResolvedValue(true);

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toMatchObject({
      found: false,
      rateLimited: true,
      rateLimitComment: { body: RATE_LIMIT_EDIT_SECTION },
    });
    // The review really was accepted by the inline-comment check — this is
    // the sequencing decision under test, not the discard path.
    expect(reviewComments.hasInlineComments).toHaveBeenCalledWith(
      'PRR_empty1',
      expect.any(Number),
    );
  });

  it('reports a fresh rolling completion over a star-gate comment found in the same poll', async () => {
    mockPoll(STAR_GATED, completionResult(COMPLETION_CANDIDATE));

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toEqual({ found: true, review: COMPLETION_REVIEW });
    // The pass CodeRabbit already finished is the answer; there is nothing
    // left to nudge it into doing.
    expect(triggerCalls()).toHaveLength(0);
  });

  it('reports a fresh rolling completion over a rate-limit comment found in the same poll', async () => {
    mockPoll(RATE_LIMITED, completionResult(COMPLETION_CANDIDATE));

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toEqual({ found: true, review: COMPLETION_REVIEW });
  });

  it('reports a fresh rolling completion over a comment-update-failure comment found in the same poll', async () => {
    mockPoll(COMMENT_UPDATE_FAILED, completionResult(COMPLETION_CANDIDATE));

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toEqual({ found: true, review: COMPLETION_REVIEW });
  });
});
