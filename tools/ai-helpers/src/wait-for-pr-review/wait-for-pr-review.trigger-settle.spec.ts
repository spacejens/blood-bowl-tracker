import { ProcessRunnerService } from '@blood-bowl-tracker/cli-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockProxy } from 'vitest-mock-extended';

import { WaitForPrReviewService } from './wait-for-pr-review.service';
import {
  COMMENT_UPDATE_FAILED,
  COMMENT_UPDATE_FAILED_COMMENT,
  createHarness,
  EMPTY,
  FOUND,
  OPTIONS,
  RATE_LIMIT_COMMENT,
  RATE_LIMITED,
  REVIEW,
  rollingResult,
} from './wait-for-pr-review.test-helpers';

/**
 * The iteration that posts the `@coderabbitai review` trigger has already
 * polled — before the comment existed — so anything that poll matched is
 * pre-trigger data. Returning it would end the wait with the very answer the
 * trigger was posted to move past — observed in practice. These tests pin
 * that this one iteration suppresses its stale rate-limit /
 * comment-update-failure result and polls again instead.
 */
describe('WaitForPrReviewService trigger settle pause', () => {
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
   * repeats forever, so a single argument models a steady state — while every
   * `gh api .../comments` call gets a no-match rolling-comment result and
   * every `gh pr comment` trigger post succeeds. Sequencing is the whole
   * point here: these tests turn on what the *second* poll sees versus the
   * first.
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

  /** Options whose trigger instant has already passed, so it fires on the first poll. */
  function triggeringOptions(timeoutMs: number) {
    return {
      ...OPTIONS,
      triggerAfterEpochSeconds: Math.floor(Date.now() / 1000),
      timeoutMs,
      intervalMs: 30_000,
    };
  }

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

  it('does not return the pre-trigger rate-limit comment on the iteration that posts the trigger', async () => {
    mockPolls(RATE_LIMITED, EMPTY);

    const result = await runWait(triggeringOptions(120_000));

    expect(triggerCalls()).toHaveLength(1);
    expect(pollCalls().length).toBeGreaterThan(1);
    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('does not return the pre-trigger comment-update-failure comment on the iteration that posts the trigger', async () => {
    mockPolls(COMMENT_UPDATE_FAILED, EMPTY);

    const result = await runWait(triggeringOptions(120_000));

    expect(triggerCalls()).toHaveLength(1);
    expect(pollCalls().length).toBeGreaterThan(1);
    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('returns a rate-limit comment found by the poll after the trigger', async () => {
    // Steady state: the same comment is still there on the fresh poll. The
    // suppression covers only the iteration that posted the trigger, so the
    // second poll reports it exactly as any non-trigger iteration would.
    mockPolls(RATE_LIMITED);

    const result = await runWait(triggeringOptions(120_000));

    expect(pollCalls()).toHaveLength(2);
    expect(result).toMatchObject({
      found: false,
      rateLimited: true,
      rateLimitComment: RATE_LIMIT_COMMENT,
    });
  });

  it('returns a comment-update-failure comment found by the poll after the trigger', async () => {
    mockPolls(COMMENT_UPDATE_FAILED);

    const result = await runWait(triggeringOptions(120_000));

    expect(pollCalls()).toHaveLength(2);
    expect(result).toEqual({
      found: false,
      commentUpdateFailed: true,
      commentUpdateFailedComment: COMMENT_UPDATE_FAILED_COMMENT,
    });
  });

  it('returns a review found by the poll after the trigger', async () => {
    mockPolls(RATE_LIMITED, FOUND);

    const result = await runWait(triggeringOptions(120_000));

    expect(pollCalls()).toHaveLength(2);
    expect(result).toEqual({ found: true, review: REVIEW });
  });

  it('waits only the settle pause, not the whole interval, before the poll after the trigger', async () => {
    // `triggeringOptions` uses the 30s interval; the poll after the trigger
    // must come at TRIGGER_SETTLE_MS (10s) instead. Asserted as a boundary —
    // nothing at 9,999ms, the second poll at exactly 10,000ms — so neither a
    // longer nor a shorter pause can pass.
    mockPolls(EMPTY);
    const pending = service.run(triggeringOptions(120_000));

    await vi.advanceTimersByTimeAsync(9_999);
    expect(pollCalls()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(pollCalls()).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    await expect(pending).resolves.toEqual({ found: false, timedOut: true });
  });
});
