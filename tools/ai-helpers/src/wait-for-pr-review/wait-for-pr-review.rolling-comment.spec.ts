import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockProxy } from 'vitest-mock-extended';

import { ProcessRunnerService } from '../shared/process-runner.service';
import { WaitForPrReviewService } from './wait-for-pr-review.service';
import {
  createHarness,
  EMPTY,
  OPTIONS,
  rateLimitEditResult,
} from './wait-for-pr-review.test-helpers';

/**
 * The bounded rate-limit block CodeRabbit edits into its rolling walkthrough
 * comment, as jq extracts it between
 * `<!-- This is an auto-generated comment: rate limited by coderabbit.ai -->`
 * and its matching `<!-- end of ... -->` marker. Real text observed on
 * PR #464 (comment id 5304526638), abridged: every line is blockquoted, so
 * the block contains no blank line of its own.
 */
const RATE_LIMIT_EDIT_SECTION =
  '\n\n> [!WARNING]\n> ## Review limit reached\n> \n' +
  "> `@spacejens`, you've reached your PR review limit, so we couldn't " +
  'start this review.\n> \n' +
  '> **Next review available in:** **30 minutes**\n> \n' +
  '> Enable usage-based reviews in Billing to review now.\n> \n';

/** What the rate-limit-edit half of the jq filter emits for that comment. */
const RATE_LIMIT_EDIT_CANDIDATE = {
  id: '5304526638',
  submittedAt: '2026-08-15T22:38:27Z',
  section: RATE_LIMIT_EDIT_SECTION,
};

/** `submittedAt` as epoch seconds — every parsed wait is relative to it. */
const RATE_LIMIT_EDIT_EPOCH_SECONDS = Math.floor(
  new Date(RATE_LIMIT_EDIT_CANDIDATE.submittedAt).getTime() / 1000,
);

describe('WaitForPrReviewService rolling-comment rate-limit edits', () => {
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
   * Routes the two `gh` calls one poll can make: `gh pr view` (formal review +
   * top-level comments) and `gh api repos/.../comments` (the rolling comment).
   * Every poll answers the same way, so this models a steady state rather than
   * a sequence.
   */
  function mockPoll(
    prView: Awaited<ReturnType<ProcessRunnerService['run']>>,
    comments: Awaited<ReturnType<ProcessRunnerService['run']>>,
  ) {
    processRunner.run.mockImplementation((_command, args) =>
      Promise.resolve(args[0] === 'api' ? comments : prView),
    );
  }

  it('reports a rate limit CodeRabbit posted by editing its rolling comment', async () => {
    mockPoll(EMPTY, rateLimitEditResult(RATE_LIMIT_EDIT_CANDIDATE));

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toEqual({
      found: false,
      rateLimited: true,
      rateLimitComment: {
        // `<commentId>@<12-hex content fingerprint>` — opaque to callers, and
        // asserted by shape here so the test does not re-derive the hash.
        id: expect.stringMatching(/^5304526638@[0-9a-f]{12}$/) as unknown,
        body: RATE_LIMIT_EDIT_SECTION,
        submittedAt: '2026-08-15T22:38:27Z',
      },
      availableAtEpochSeconds: RATE_LIMIT_EDIT_EPOCH_SECONDS + 30 * 60,
    });
    // First poll only: the reviews call, then the rolling-comment call.
    expect(processRunner.run).toHaveBeenCalledTimes(2);
  });
});
