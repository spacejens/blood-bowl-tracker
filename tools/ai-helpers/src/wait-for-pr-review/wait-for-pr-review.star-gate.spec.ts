import { ProcessRunnerService } from '@blood-bowl-tracker/cli-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockProxy } from 'vitest-mock-extended';

import { WaitForPrReviewService } from './wait-for-pr-review.service';
import {
  COMMENT_UPDATE_FAILED_COMMENT,
  createHarness,
  EMPTY,
  extractStarGateFilter,
  FOUND,
  HEAD_REF_OID,
  jqProgramOf,
  OPTIONS,
  RATE_LIMIT_COMMENT,
  RATE_LIMITED,
  REVIEW,
  rollingResult,
  STAR_GATE_COMMENT,
  STAR_GATED,
  starGatedWithBody,
} from './wait-for-pr-review.test-helpers';

/**
 * A `gh pr view` result carrying both a star-gate comment and one other
 * signal in the same poll — the shape a real poll can produce, since
 * `reviewsCall` runs all four filters independently in one jq program and
 * each can independently match a different comment.
 */
function starGatedAnd(extra: Record<string, unknown>) {
  return {
    exitCode: 0,
    stdout: `${JSON.stringify({
      review: null,
      rateLimitComment: null,
      commentUpdateFailedComment: null,
      starGateComment: STAR_GATE_COMMENT,
      headRefOid: HEAD_REF_OID,
      ...extra,
    })}\n`,
    stderr: '',
  };
}

/**
 * CodeRabbit's "does not receive automatic reviews" (star-gate) comment is
 * detected the same way as its rate-limit / comment-update-failure
 * comments, but reacted to differently: instead of ending the wait early
 * with a dedicated result field, `run()` treats it as an internal trigger
 * condition (like `--trigger-after`) and posts `@coderabbitai review`
 * immediately, then keeps polling for the review that follows.
 */
describe('WaitForPrReviewService star-gate detection', () => {
  let service: WaitForPrReviewService;
  let processRunner: MockProxy<ProcessRunnerService>;

  beforeEach(async () => {
    vi.useFakeTimers();
    ({ service, processRunner } = await createHarness());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  type RunResult = Awaited<ReturnType<ProcessRunnerService['run']>>;

  /**
   * Answers each `gh pr view` poll from `prViews` in order — the last entry
   * repeats forever, so a single argument models a steady state — while
   * every `gh api .../comments` call gets a no-match rolling-comment result
   * and every `gh pr comment` trigger post succeeds.
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

  /** The `gh pr view` polls, in call order. */
  function pollCalls() {
    return processRunner.run.mock.calls.filter((call) => call[1][1] === 'view');
  }

  /** The `gh pr comment` trigger posts. */
  function triggerCalls() {
    return processRunner.run.mock.calls.filter(
      (call) => call[1][1] === 'comment',
    );
  }

  /**
   * Runs the wait to completion under fake timers: the returned promise only
   * settles once enough timer time has been advanced, so the advancing has
   * to happen while the wait is still pending rather than after an `await`.
   */
  async function runWait(
    options: Parameters<WaitForPrReviewService['run']>[0],
    advanceMs = 15 * 60 * 1000,
  ): Promise<Awaited<ReturnType<WaitForPrReviewService['run']>>> {
    const pending = service.run(options);
    await vi.advanceTimersByTimeAsync(advanceMs);
    return pending;
  }

  it('posts the trigger comment as soon as the star-gate comment is found, without a caller-supplied trigger-after', async () => {
    mockPolls(STAR_GATED, EMPTY);

    await runWait({ ...OPTIONS, timeoutMs: 120_000, intervalMs: 30_000 });

    expect(triggerCalls()).toHaveLength(1);
    expect(triggerCalls()[0][1]).toEqual([
      'pr',
      'comment',
      OPTIONS.prNumber,
      '--body',
      '@coderabbitai review',
    ]);
  });

  it('returns the review found by the poll after the trigger', async () => {
    mockPolls(STAR_GATED, FOUND);

    const result = await runWait({
      ...OPTIONS,
      timeoutMs: 120_000,
      intervalMs: 30_000,
    });

    expect(pollCalls()).toHaveLength(2);
    expect(triggerCalls()).toHaveLength(1);
    expect(result).toEqual({ found: true, review: REVIEW });
  });

  it('times out normally when no review follows the trigger', async () => {
    mockPolls(STAR_GATED, EMPTY);

    const result = await runWait({
      ...OPTIONS,
      timeoutMs: 90_000,
      intervalMs: 30_000,
    });

    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('triggers only once even though the star-gate comment persists on every later poll', async () => {
    mockPolls(STAR_GATED);

    await runWait({ ...OPTIONS, timeoutMs: 90_000, intervalMs: 30_000 });

    expect(pollCalls().length).toBeGreaterThan(1);
    expect(triggerCalls()).toHaveLength(1);
  });

  it('waits only the settle pause, not the whole interval, before the poll after the trigger', async () => {
    mockPolls(EMPTY);
    processRunner.run.mockImplementation((_command, args) => {
      if (args[1] === 'comment') {
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      }
      if (args[0] === 'api') {
        return Promise.resolve(rollingResult({}));
      }
      return Promise.resolve(STAR_GATED);
    });
    const pending = service.run({
      ...OPTIONS,
      timeoutMs: 120_000,
      intervalMs: 30_000,
    });

    await vi.advanceTimersByTimeAsync(9_999);
    expect(pollCalls()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(pollCalls()).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    await expect(pending).resolves.toEqual({ found: false, timedOut: true });
  });

  it('does not trigger for a coderabbit comment whose body lacks the star-gate phrase', async () => {
    mockPolls(starGatedWithBody('Some unrelated CodeRabbit comment.'));

    const result = await runWait({
      ...OPTIONS,
      timeoutMs: 60_000,
      intervalMs: 30_000,
    });

    expect(triggerCalls()).toHaveLength(0);
    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('ignores the star-gate phrase when it only appears inside a code span', async () => {
    mockPolls(
      starGatedWithBody(
        'See `does not receive automatic reviews` in the CodeRabbit docs.',
      ),
    );

    const result = await runWait({
      ...OPTIONS,
      timeoutMs: 60_000,
      intervalMs: 30_000,
    });

    expect(triggerCalls()).toHaveLength(0);
    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('includes the star-gate filter in the reviews-call jq program', async () => {
    mockPolls(EMPTY);

    await runWait({ ...OPTIONS, timeoutMs: 30_000, intervalMs: 30_000 });

    const prViewCalls = pollCalls();
    const subFilter = extractStarGateFilter(jqProgramOf(prViewCalls[0][1]));
    expect(subFilter).toContain('does not receive automatic reviews');
  });

  it('never surfaces a starGateComment field in the wait result', async () => {
    mockPolls(STAR_GATED, EMPTY);

    const result = await runWait({
      ...OPTIONS,
      timeoutMs: 90_000,
      intervalMs: 30_000,
    });

    expect(result).not.toHaveProperty('starGateComment');
    expect(result).not.toHaveProperty('starGated');
  });

  it('triggers, and suppresses the stale rate-limit result, when a poll finds both signals at once', async () => {
    // Poll 1 finds a star-gate comment AND a rate-limit comment together —
    // two independent jq sub-filters matching two different comments in the
    // same `gh pr view` call. The trigger fires (nothing has triggered yet),
    // and the rate-limit result must be suppressed for this iteration, the
    // same way a caller-requested `--trigger-after` retrigger suppresses a
    // stale rate-limit/comment-update-failure match found on the very poll
    // that posts the trigger.
    mockPolls(starGatedAnd({ rateLimitComment: RATE_LIMIT_COMMENT }), EMPTY);

    const result = await runWait({
      ...OPTIONS,
      timeoutMs: 90_000,
      intervalMs: 30_000,
    });

    expect(triggerCalls()).toHaveLength(1);
    expect(pollCalls().length).toBeGreaterThan(1);
    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('triggers, and suppresses the stale comment-update-failure result, when a poll finds both signals at once', async () => {
    mockPolls(
      starGatedAnd({
        commentUpdateFailedComment: COMMENT_UPDATE_FAILED_COMMENT,
      }),
      EMPTY,
    );

    const result = await runWait({
      ...OPTIONS,
      timeoutMs: 90_000,
      intervalMs: 30_000,
    });

    expect(triggerCalls()).toHaveLength(1);
    expect(pollCalls().length).toBeGreaterThan(1);
    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('reports the rate-limit comment found on the poll after the concurrent-signal trigger', async () => {
    // The suppression covers only the iteration that posted the trigger; a
    // rate-limit comment found by a later, fresh poll is reported normally.
    mockPolls(
      starGatedAnd({ rateLimitComment: RATE_LIMIT_COMMENT }),
      RATE_LIMITED,
    );

    const result = await runWait({
      ...OPTIONS,
      timeoutMs: 90_000,
      intervalMs: 30_000,
    });

    expect(triggerCalls()).toHaveLength(1);
    expect(pollCalls()).toHaveLength(2);
    expect(result).toMatchObject({
      found: false,
      rateLimited: true,
      rateLimitComment: RATE_LIMIT_COMMENT,
    });
  });
});
