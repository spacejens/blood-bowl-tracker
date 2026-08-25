import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockProxy } from 'vitest-mock-extended';

import { ProcessRunnerService } from '../shared/process-runner.service';
import { WaitForPrReviewService } from './wait-for-pr-review.service';
import {
  createHarness,
  EMPTY,
  extractCommentUpdateFailedFilter,
  extractRateLimitFilter,
  jqProgramOf,
  OPTIONS,
  RATE_LIMIT_COMMENT,
  RATE_LIMITED,
  rollingResult,
} from './wait-for-pr-review.test-helpers';

/**
 * CodeRabbit's own auto-generated reply to a manual `@coderabbitai review`
 * (or similar) command — distinct from a spontaneous top-level notice, and
 * carrying `COMMAND_REPLY_MARKER` instead. When that reply itself says the
 * command bounced off an already-active rate limit, it states no wait
 * duration of its own — unlike the notice that first reported the limit —
 * so it must never shadow a real, still-governing duration a caller already
 * learned from that earlier notice. `rateLimitFilter` and
 * `commentUpdateFailedFilter` exclude any comment carrying this marker
 * entirely, so these command replies simply never reach the wait as a
 * candidate.
 */
describe('WaitForPrReviewService command-reply exclusion', () => {
  let service: WaitForPrReviewService;
  let processRunner: MockProxy<ProcessRunnerService>;

  beforeEach(async () => {
    vi.useFakeTimers();
    ({ service, processRunner } = await createHarness());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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

  it('excludes the command-reply marker from the rate-limit jq clause', async () => {
    processRunner.run.mockImplementation((_command, args) =>
      Promise.resolve(args[0] === 'api' ? rollingResult({}) : EMPTY),
    );

    await runWait({ ...OPTIONS, timeoutMs: 30_000, intervalMs: 30_000 });

    const [, args] = processRunner.run.mock.calls[0];
    const subFilter = extractRateLimitFilter(jqProgramOf(args));
    expect(subFilter).toContain(
      'contains("<!-- This is an auto-generated reply by CodeRabbit -->") | not',
    );
  });

  it('excludes the command-reply marker from the comment-update-failed jq clause', async () => {
    processRunner.run.mockImplementation((_command, args) =>
      Promise.resolve(args[0] === 'api' ? rollingResult({}) : EMPTY),
    );

    await runWait({ ...OPTIONS, timeoutMs: 30_000, intervalMs: 30_000 });

    const [, args] = processRunner.run.mock.calls[0];
    const subFilter = extractCommentUpdateFailedFilter(jqProgramOf(args));
    expect(subFilter).toContain(
      'contains("<!-- This is an auto-generated reply by CodeRabbit -->") | not',
    );
  });

  it('a real notice comment carrying no command-reply marker is still matched normally', async () => {
    // Sanity check that the new exclusion clause does not accidentally
    // suppress a genuine, spontaneous rate-limit notice.
    processRunner.run.mockImplementation((_command, args) =>
      Promise.resolve(args[0] === 'api' ? rollingResult({}) : RATE_LIMITED),
    );

    const result = await runWait({
      ...OPTIONS,
      timeoutMs: 30_000,
      intervalMs: 30_000,
    });

    expect(result).toMatchObject({
      found: false,
      rateLimited: true,
      rateLimitComment: RATE_LIMIT_COMMENT,
    });
  });
});
