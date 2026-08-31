import { ProcessRunnerService } from '@blood-bowl-tracker/cli-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockProxy } from 'vitest-mock-extended';

import { PullRequestReviewCommentsService } from './pull-request-review-comments.service';
import { WaitForPrReviewService } from './wait-for-pr-review.service';
import {
  COMMENT_UPDATE_FAILED,
  COMPLETION_CANDIDATE,
  COMPLETION_REVIEW,
  completionResult,
  createHarness,
  EMPTY,
  EMPTY_BODY_FOUND,
  jqProgramOf,
  OPTIONS,
  RATE_LIMIT_EDIT_CANDIDATE,
  RATE_LIMIT_EDIT_SECTION,
  RATE_LIMITED,
  rateLimitEditResult,
  rollingResult,
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

  it('reports a concurrent rolling rate-limit edit over a star-gate comment found in the same poll, without triggering', async () => {
    // A rate-limit edit is fresher evidence than a star-gate comment, and
    // outranks it the same way it outranks every other reviews-call match —
    // this pins that the star-gate's own trigger behavior does not run once
    // the rolling call has already produced a different answer.
    mockPoll(STAR_GATED, rateLimitEditResult(RATE_LIMIT_EDIT_CANDIDATE));

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toMatchObject({
      found: false,
      rateLimited: true,
      rateLimitComment: { body: RATE_LIMIT_EDIT_SECTION },
    });
    expect(triggerCalls()).toHaveLength(0);
  });

  it('carries a discarded empty-artifact review id through a trigger-suppressed poll whose rolling call matched a rate-limit edit', async () => {
    // Poll 1 combines two signals the reviews-half discard path and the
    // rolling-comment replacement path can each produce on their own: a
    // genuine 0-inline-comment empty artifact (discarded, not returned as
    // `review`) and a concurrent rolling rate-limit edit (which replaces the
    // discarded outcome). A rate-limit result alone would make `run` return
    // immediately, so the discarded id would never be consulted again — this
    // test instead makes the caller's own retrigger due on this same poll,
    // which suppresses that immediate return and lets the loop reach a
    // second poll, where the discarded id must appear in the exclusion list.
    let prViewCalls = 0;
    let apiCalls = 0;
    processRunner.run.mockImplementation((_command, args) => {
      if (args[1] === 'comment') {
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      }
      if (args[0] === 'api') {
        apiCalls += 1;
        return Promise.resolve(
          apiCalls === 1
            ? rateLimitEditResult(RATE_LIMIT_EDIT_CANDIDATE)
            : rollingResult({}),
        );
      }
      prViewCalls += 1;
      return Promise.resolve(prViewCalls === 1 ? EMPTY_BODY_FOUND : EMPTY);
    });
    reviewComments.hasInlineComments.mockResolvedValue(false);

    const result = await runWait({
      ...OPTIONS,
      triggerAfterEpochSeconds: Math.floor(Date.now() / 1000),
      timeoutMs: 90_000,
      intervalMs: 30_000,
    });

    expect(result).toEqual({ found: false, timedOut: true });
    // The retrigger fired on poll 1 despite the rolling rate-limit match,
    // proving this iteration's early return was suppressed and the loop
    // continued to a second poll.
    expect(triggerCalls()).toHaveLength(1);
    const prViewArgs = processRunner.run.mock.calls
      .filter(([, args]) => args[0] === 'pr' && args[1] === 'view')
      .map(([, args]) => args);
    expect(prViewArgs.length).toBeGreaterThanOrEqual(2);
    expect(jqProgramOf(prViewArgs[0])).not.toContain('.id !=');
    expect(jqProgramOf(prViewArgs[1])).toContain('.id != "PRR_empty1"');
  });
});
