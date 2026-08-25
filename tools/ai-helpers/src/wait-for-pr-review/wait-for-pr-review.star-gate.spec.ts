import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockProxy } from 'vitest-mock-extended';

import { ProcessRunnerService } from '../shared/process-runner.service';
import { WaitForPrReviewService } from './wait-for-pr-review.service';
import {
  createHarness,
  EMPTY,
  FOUND,
  jqProgramOf,
  OPTIONS,
  REVIEW,
  rollingResult,
  STAR_GATED,
  starGatedWithBody,
} from './wait-for-pr-review.test-helpers';

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
    expect(jqProgramOf(prViewCalls[0][1])).toContain('starGateComment');
    expect(jqProgramOf(prViewCalls[0][1])).toContain(
      'does not receive automatic reviews',
    );
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
});
