import { ProcessRunnerService } from '@blood-bowl-tracker/cli-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockProxy } from 'vitest-mock-extended';

import { WaitForPrReviewService } from './wait-for-pr-review.service';
import {
  COMPLETION_CANDIDATE,
  createHarness,
  EMPTY,
  OPTIONS,
  RATE_LIMIT_EDIT_CANDIDATE,
  RATE_LIMIT_EDIT_EPOCH_SECONDS,
  RATE_LIMIT_EDIT_SECTION,
  rateLimitEditResult,
  rollingResult,
} from './wait-for-pr-review.test-helpers';

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
      availableAtEpochSeconds: RATE_LIMIT_EDIT_EPOCH_SECONDS + 30 * 60 + 60,
    });
    // First poll only: the reviews call, then the rolling-comment call.
    expect(processRunner.run).toHaveBeenCalledTimes(2);
  });

  it('asks one rolling-comment query for both signals, marker-bounded', async () => {
    mockPoll(EMPTY, rateLimitEditResult(RATE_LIMIT_EDIT_CANDIDATE));

    await runWait({ ...OPTIONS, intervalMs: 30_000 });

    const [command, args] = processRunner.run.mock.calls[1];
    expect(command).toBe('gh');
    expect(args[0]).toBe('api');
    expect(args[1]).toBe(
      'repos/{owner}/{repo}/issues/392/comments?per_page=100&since=2025-10-09T08:53:19.000Z',
    );
    expect(args[2]).toBe('--jq');
    // Both halves come out of the same call — a poll stays at two gh calls.
    expect(args[3]).toContain('{completion: (');
    expect(args[3]).toContain('rateLimitEdit: (');
    expect(args[3]).toContain(
      'contains("<!-- This is an auto-generated comment: rate limited by coderabbit.ai -->")',
    );
    // Paired markers, so the section (and the wait-duration parse) can never
    // run past the warning block into the walkthrough.
    expect(args[3]).toContain(
      '<!-- end of auto-generated comment: rate limited by coderabbit.ai -->',
    );
    expect(args[3]).toContain('(.updated_at | fromdateiso8601) >= 1760000000');
    expect(args[3]).toContain(
      'test("rate limit|rate-limit|review limit|usage limit"; "i")',
    );
  });

  it('does not re-report a stale rate-limit section after a later unrelated edit', async () => {
    // First wait surfaces the rate limit and hands the caller its id.
    mockPoll(EMPTY, rateLimitEditResult(RATE_LIMIT_EDIT_CANDIDATE));
    const first = await runWait({ ...OPTIONS, intervalMs: 30_000 });
    const excludeCommentId = first.rateLimitComment?.id;
    expect(excludeCommentId).toBeDefined();

    // CodeRabbit then edits something else in the same rolling comment (the
    // commits list, say): `updated_at` advances, the rate-limit block does
    // not. The content hash — and so the composite id — is unchanged, so the
    // caller's exclusion still covers it.
    mockPoll(
      EMPTY,
      rateLimitEditResult({
        ...RATE_LIMIT_EDIT_CANDIDATE,
        submittedAt: '2026-08-15T23:10:00Z',
      }),
    );

    const second = await runWait({
      ...OPTIONS,
      excludeCommentId,
      intervalMs: 30_000,
      timeoutMs: 60_000,
    });

    expect(second).toEqual({ found: false, timedOut: true });
  });

  it('reports a genuinely new rate-limit section after the previous one was excluded', async () => {
    mockPoll(EMPTY, rateLimitEditResult(RATE_LIMIT_EDIT_CANDIDATE));
    const first = await runWait({ ...OPTIONS, intervalMs: 30_000 });
    const excludeCommentId = first.rateLimitComment?.id;

    // A fresh rate limit on a later attempt: same comment, different block —
    // a different stated wait, so a different content hash and a different id.
    const refreshed = RATE_LIMIT_EDIT_SECTION.replace(
      '**30 minutes**',
      '**45 minutes**',
    );
    mockPoll(
      EMPTY,
      rateLimitEditResult({
        ...RATE_LIMIT_EDIT_CANDIDATE,
        submittedAt: '2026-08-15T23:10:00Z',
        section: refreshed,
      }),
    );

    const second = await runWait({
      ...OPTIONS,
      excludeCommentId,
      intervalMs: 30_000,
    });

    expect(second).toMatchObject({ found: false, rateLimited: true });
    expect(second.rateLimitComment?.id).not.toBe(excludeCommentId);
    expect(second.rateLimitComment?.id).toMatch(/^5304526638@[0-9a-f]{12}$/);
    // Anchored to the comment's own updated_at, not to "now".
    expect(second.availableAtEpochSeconds).toBe(
      Math.floor(new Date('2026-08-15T23:10:00Z').getTime() / 1000) +
        45 * 60 +
        60,
    );
  });

  it('prefers a rate-limit edit over a completion found in the same poll', async () => {
    mockPoll(
      EMPTY,
      rollingResult({
        completion: COMPLETION_CANDIDATE,
        rateLimitEdit: RATE_LIMIT_EDIT_CANDIDATE,
      }),
    );

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    // A rate limit means the pass never ran; a stale "nothing to report"
    // section in the same comment must not be reported as a finished review.
    expect(result).toMatchObject({ found: false, rateLimited: true });
    expect(result.review).toBeUndefined();
  });

  it('reads the wait out of the bounded warning block only', async () => {
    // The block states its own wait; anything past the closing marker (a
    // walkthrough mentioning "5 minutes", say) is not part of the extracted
    // section, so the parsed wait comes from the block.
    mockPoll(EMPTY, rateLimitEditResult(RATE_LIMIT_EDIT_CANDIDATE));

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result.availableAtEpochSeconds).toBe(
      RATE_LIMIT_EDIT_EPOCH_SECONDS + 30 * 60 + 60,
    );
  });

  it('does not treat a phrase found only inside code formatting as a rate limit', async () => {
    mockPoll(
      EMPTY,
      rateLimitEditResult({
        ...RATE_LIMIT_EDIT_CANDIDATE,
        section:
          '\n\n> Reviewing branch `issue-465-wait-for-pr-review-misses-' +
          'coderabbit-rate-limit-edits`.\n\n',
      }),
    );

    const result = await runWait({
      ...OPTIONS,
      intervalMs: 30_000,
      timeoutMs: 60_000,
    });

    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('discards a rate-limit-edit candidate missing the fields the filter should produce', async () => {
    mockPoll(EMPTY, rateLimitEditResult({ id: '5304526638' }));

    const result = await runWait({
      ...OPTIONS,
      intervalMs: 30_000,
      timeoutMs: 60_000,
    });

    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('still finds a completion when the rate-limit half is empty', async () => {
    mockPoll(EMPTY, rollingResult({ completion: COMPLETION_CANDIDATE }));

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toMatchObject({ found: true });
  });
});
