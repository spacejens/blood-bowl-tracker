import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import {
  ProcessRunnerService,
  TIMED_OUT_EXIT_CODE,
} from '../shared/process-runner.service';
import { WaitForPrReviewService } from './wait-for-pr-review.service';

const REVIEW = {
  id: 'PRR_review1',
  author: { login: 'coderabbitai' },
  state: 'COMMENTED',
  submittedAt: '2026-08-11T10:00:00Z',
};

const RATE_LIMIT_COMMENT = {
  id: 'IC_comment1',
  body: '> [!WARNING]\n> Rate limit exceeded.',
  submittedAt: '2026-08-11T10:00:00Z',
};

/**
 * `parseAvailableAt` anchors to the rate-limit comment's own `submittedAt`,
 * not `Date.now()` — a stale/re-matched comment should not get a
 * freshly-computed wait. Every parsed-wait-time test below expects its
 * result relative to this fixed instant, not to whatever "now" is when the
 * test happens to run.
 */
const RATE_LIMIT_COMMENT_EPOCH_SECONDS = Math.floor(
  new Date(RATE_LIMIT_COMMENT.submittedAt).getTime() / 1000,
);

/** A `gh` invocation that found nothing: both halves of the filter are null. */
const EMPTY = {
  exitCode: 0,
  stdout: '{"review":null,"rateLimitComment":null}\n',
  stderr: '',
};
/** A `gh` invocation that found a qualifying review and no rate-limit comment. */
const FOUND = {
  exitCode: 0,
  stdout: `${JSON.stringify({ review: REVIEW, rateLimitComment: null }, null, 2)}\n`,
  stderr: '',
};
/** A `gh` invocation that found a rate-limit comment and no review. */
const RATE_LIMITED = {
  exitCode: 0,
  stdout: `${JSON.stringify({ review: null, rateLimitComment: RATE_LIMIT_COMMENT }, null, 2)}\n`,
  stderr: '',
};

const OPTIONS = {
  prNumber: '392',
  developerLogin: 'spacejens',
  sinceEpochSeconds: 1_760_000_000,
};

describe('WaitForPrReviewService', () => {
  let service: WaitForPrReviewService;
  let processRunner: MockProxy<ProcessRunnerService>;

  beforeEach(async () => {
    vi.useFakeTimers();
    processRunner = mock<ProcessRunnerService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        WaitForPrReviewService,
        { provide: ProcessRunnerService, useValue: processRunner },
      ],
    }).compile();
    service = moduleRef.get(WaitForPrReviewService);
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

  it('returns the parsed review found on the first poll', async () => {
    processRunner.run.mockResolvedValue(FOUND);

    const result = await runWait(OPTIONS);

    expect(result).toEqual({ found: true, review: REVIEW });
    expect(processRunner.run).toHaveBeenCalledTimes(1);
  });

  it('queries gh for non-author reviews submitted after the given instant', async () => {
    processRunner.run.mockResolvedValue(FOUND);

    await runWait(OPTIONS);

    const [command, args] = processRunner.run.mock.calls[0];
    expect(command).toBe('gh');
    expect(args.slice(0, 6)).toEqual([
      'pr',
      'view',
      '392',
      '--json',
      'reviews,comments',
      '--jq',
    ]);
    expect(args[6]).toContain('.author.login != "spacejens"');
    expect(args[6]).toContain('fromdateiso8601) >= 1760000000');
  });

  it('includes a review submitted in the same second as sinceEpochSeconds', async () => {
    processRunner.run.mockResolvedValue(FOUND);

    await runWait(OPTIONS);

    const [, args] = processRunner.run.mock.calls[0];
    // Strict '>' would exclude a review submitted in the watermark's own
    // second; the filter must use '>=' so same-second reviews still qualify.
    expect(args[6]).not.toContain('fromdateiso8601) > 1760000000');
  });

  it('excludes the review passed as excludeReviewId, even at the same instant', async () => {
    processRunner.run.mockResolvedValue(FOUND);

    await runWait({ ...OPTIONS, excludeReviewId: 'PRR_review1' });

    const [, args] = processRunner.run.mock.calls[0];
    expect(args[6]).toContain('.id != "PRR_review1"');
  });

  it('omits the id exclusion clause when excludeReviewId is not given', async () => {
    processRunner.run.mockResolvedValue(FOUND);

    await runWait(OPTIONS);

    const [, args] = processRunner.run.mock.calls[0];
    expect(args[6]).not.toContain('.id !=');
  });

  it('keeps polling on the interval until a review appears', async () => {
    processRunner.run
      .mockResolvedValueOnce(EMPTY)
      .mockResolvedValueOnce(EMPTY)
      .mockResolvedValue(FOUND);

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toEqual({ found: true, review: REVIEW });
    expect(processRunner.run).toHaveBeenCalledTimes(3);
  });

  it('reports a timeout when no qualifying review ever appears', async () => {
    processRunner.run.mockResolvedValue(EMPTY);

    const result = await runWait({
      ...OPTIONS,
      timeoutMs: 90_000,
      intervalMs: 30_000,
    });

    expect(result).toEqual({ found: false, timedOut: true });
    // Polls at 0/30s/60s: after the 60s poll, sleeping 30s more resumes
    // exactly at the 90s deadline — the wait must not issue a further `gh`
    // call at that point, only report the timeout.
    expect(processRunner.run).toHaveBeenCalledTimes(3);
  });

  it('tolerates a failing gh call and retries on the next interval', async () => {
    processRunner.run
      .mockResolvedValueOnce({
        exitCode: 1,
        stdout: '',
        stderr: 'could not resolve host',
      })
      .mockResolvedValue(FOUND);

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toEqual({ found: true, review: REVIEW });
    expect(processRunner.run).toHaveBeenCalledTimes(2);
  });

  it('tolerates unparseable gh output and retries on the next interval', async () => {
    processRunner.run
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'not json', stderr: '' })
      .mockResolvedValue(FOUND);

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toEqual({ found: true, review: REVIEW });
    expect(processRunner.run).toHaveBeenCalledTimes(2);
  });

  it('passes the remaining time budget to each gh call, shrinking toward the deadline, floored at one interval once exhausted', async () => {
    processRunner.run.mockResolvedValue(EMPTY);

    await runWait({ ...OPTIONS, timeoutMs: 90_000, intervalMs: 30_000 });

    const budgets = processRunner.run.mock.calls.map((call) => call[2]);
    // Only 3 polls happen: sleeping after the 3rd poll resumes exactly at
    // the deadline, which is reported as a timeout rather than issuing a
    // 4th `gh` call.
    expect(budgets).toEqual([90_000, 60_000, 30_000]);
  });

  it('bounds even a zero-budget wait to one interval, never leaving the single poll unbounded', async () => {
    processRunner.run.mockResolvedValue(FOUND);

    await runWait({ ...OPTIONS, timeoutMs: 0, intervalMs: 30_000 });

    expect(processRunner.run.mock.calls[0][2]).toBe(30_000);
  });

  it('treats a gh call killed by its own timeout as not found, and times out once the deadline is reached', async () => {
    // Mirrors what ProcessRunnerService resolves with when its own timeoutMs
    // kills a stalled `gh` call — never a rejection, so this must not crash
    // the wait, and a stalled/late call must never surface as `found`.
    processRunner.run.mockResolvedValue({
      exitCode: TIMED_OUT_EXIT_CODE,
      stdout: '',
      stderr: '',
    });

    const result = await runWait({
      ...OPTIONS,
      timeoutMs: 60_000,
      intervalMs: 30_000,
    });

    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('defaults to a 10-minute timeout and a 30-second interval', async () => {
    processRunner.run.mockResolvedValue(EMPTY);

    const result = await runWait(OPTIONS);

    expect(result).toEqual({ found: false, timedOut: true });
    // Default timeout 600_000ms / interval 30_000ms: polls at
    // 0/30s/60s/.../570s — 20 polls. Sleeping after the 20th poll resumes
    // exactly at the 600s deadline, which is reported as a timeout rather
    // than issuing a 21st `gh` call.
    expect(processRunner.run).toHaveBeenCalledTimes(20);
  });

  it('returns immediately when a qualifying rate-limit comment is found', async () => {
    processRunner.run.mockResolvedValue(RATE_LIMITED);

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toEqual({
      found: false,
      rateLimited: true,
      rateLimitComment: RATE_LIMIT_COMMENT,
    });
    // Returns on the first poll rather than waiting out the full timeout.
    expect(processRunner.run).toHaveBeenCalledTimes(1);
  });

  it('prefers a review over a rate-limit comment found in the same poll', async () => {
    processRunner.run.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({
        review: REVIEW,
        rateLimitComment: RATE_LIMIT_COMMENT,
      }),
      stderr: '',
    });

    const result = await runWait(OPTIONS);

    expect(result).toEqual({ found: true, review: REVIEW });
  });

  it('asks gh for comments too, filtered to CodeRabbit rate-limit wording at or after the watermark', async () => {
    processRunner.run.mockResolvedValue(FOUND);

    await runWait(OPTIONS);

    const [, args] = processRunner.run.mock.calls[0];
    expect(args[4]).toBe('reviews,comments');
    expect(args[6]).toContain('.comments[]');
    expect(args[6]).toContain('test("coderabbit"; "i")');
    expect(args[6]).toContain(
      'test("rate limit|rate-limit|review limit|usage limit"; "i")',
    );
    expect(args[6]).toContain('(.createdAt | fromdateiso8601) >= 1760000000');
    expect(args[6]).toContain('submittedAt: .createdAt');
  });

  it('excludes the comment passed as excludeCommentId', async () => {
    processRunner.run.mockResolvedValue(FOUND);

    await runWait({ ...OPTIONS, excludeCommentId: 'IC_comment1' });

    const [, args] = processRunner.run.mock.calls[0];
    expect(args[6]).toContain('.id != "IC_comment1"');
  });

  it('keeps polling when neither a review nor a rate-limit comment qualifies', async () => {
    processRunner.run
      .mockResolvedValueOnce(EMPTY)
      .mockResolvedValue(RATE_LIMITED);

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toMatchObject({ found: false, rateLimited: true });
    expect(processRunner.run).toHaveBeenCalledTimes(2);
  });

  /** Builds a `gh` result whose only match is a rate-limit comment with the given body. */
  function rateLimitedWithBody(body: string) {
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        review: null,
        rateLimitComment: { ...RATE_LIMIT_COMMENT, body },
      }),
      stderr: '',
    };
  }

  it('does not treat a phrase match found only inside a code span as a rate limit', async () => {
    // Real false positive from PR #399: CodeRabbit's own "review in
    // progress" status comment echoes this branch's name in a checkbox's
    // inline code, and the branch name happens to contain "rate-limit".
    // `gh`/jq's own coarse phrase test can still surface this as a
    // candidate — the service itself must discard it once it strips code
    // formatting and re-checks.
    processRunner.run
      .mockResolvedValueOnce(
        rateLimitedWithBody(
          'Currently processing new changes in this PR. This may take a ' +
            'few minutes, please wait...\n\n' +
            'Commit unit tests in branch `issue-397-review-wait-coderabbit-rate-limit`',
        ),
      )
      .mockResolvedValue(FOUND);

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toEqual({ found: true, review: REVIEW });
    expect(processRunner.run).toHaveBeenCalledTimes(2);
  });

  it('still detects a rate limit stated in prose alongside an unrelated code span', async () => {
    processRunner.run.mockResolvedValue(
      rateLimitedWithBody(
        'Rate limit exceeded. See branch `issue-397-review-wait-coderabbit-rate-limit`.',
      ),
    );

    const result = await runWait(OPTIONS);

    expect(result).toMatchObject({ found: false, rateLimited: true });
  });

  it('parses a minutes wait out of the rate-limit comment body', async () => {
    processRunner.run.mockResolvedValue(
      rateLimitedWithBody(
        'Rate limit exceeded. Reviews will be available again in 45 minutes.',
      ),
    );

    const result = await runWait(OPTIONS);

    expect(result.availableAtEpochSeconds).toBe(
      RATE_LIMIT_COMMENT_EPOCH_SECONDS + 45 * 60,
    );
  });

  it('parses an hours wait out of the rate-limit comment body', async () => {
    processRunner.run.mockResolvedValue(
      rateLimitedWithBody('Rate limit exceeded. Please retry in 2 hours.'),
    );

    const result = await runWait(OPTIONS);

    expect(result.availableAtEpochSeconds).toBe(
      RATE_LIMIT_COMMENT_EPOCH_SECONDS + 120 * 60,
    );
  });

  it('parses a singular unit and matches keywords case-insensitively', async () => {
    processRunner.run.mockResolvedValue(
      rateLimitedWithBody('Rate limit exceeded. The limit RESETS in 1 hour.'),
    );

    const result = await runWait(OPTIONS);

    expect(result.availableAtEpochSeconds).toBe(
      RATE_LIMIT_COMMENT_EPOCH_SECONDS + 60 * 60,
    );
  });

  it('parses a realistic "wait ... before" rate-limit sentence', async () => {
    processRunner.run.mockResolvedValue(
      rateLimitedWithBody(
        'Rate limit exceeded. Please wait 12 minutes before requesting another review.',
      ),
    );

    const result = await runWait(OPTIONS);

    expect(result.availableAtEpochSeconds).toBe(
      RATE_LIMIT_COMMENT_EPOCH_SECONDS + 12 * 60,
    );
  });

  it('ignores a duration in a sentence with no wait-time keyword', async () => {
    processRunner.run.mockResolvedValue(
      rateLimitedWithBody(
        'Rate limit exceeded. This review took 3 minutes of processing.',
      ),
    );

    const result = await runWait(OPTIONS);

    expect(result.availableAtEpochSeconds).toBeUndefined();
    expect(result.rateLimited).toBe(true);
  });

  it('omits the wait time when no duration can be parsed', async () => {
    processRunner.run.mockResolvedValue(
      rateLimitedWithBody('Rate limit exceeded. Try again later.'),
    );

    const result = await runWait(OPTIONS);

    expect(result.availableAtEpochSeconds).toBeUndefined();
  });

  it('takes the first keyword sentence that carries a duration', async () => {
    processRunner.run.mockResolvedValue(
      rateLimitedWithBody(
        'Rate limit exceeded.\nReviews are available again in 30 minutes.\nRetry in 90 minutes if it persists.',
      ),
    );

    const result = await runWait(OPTIONS);

    expect(result.availableAtEpochSeconds).toBe(
      RATE_LIMIT_COMMENT_EPOCH_SECONDS + 30 * 60,
    );
  });

  /** Picks out the `gh pr comment` calls from everything the runner was asked to run. */
  function triggerCalls() {
    return processRunner.run.mock.calls.filter(
      (call) => call[1][1] === 'comment',
    );
  }

  it('posts one review trigger once the trigger instant passes, then keeps polling', async () => {
    processRunner.run.mockResolvedValue(EMPTY);
    const triggerAfterEpochSeconds = Math.floor(Date.now() / 1000) + 60;

    const result = await runWait({
      ...OPTIONS,
      triggerAfterEpochSeconds,
      timeoutMs: 180_000,
      intervalMs: 30_000,
    });

    expect(triggerCalls()).toHaveLength(1);
    expect(triggerCalls()[0][0]).toBe('gh');
    expect(triggerCalls()[0][1]).toEqual([
      'pr',
      'comment',
      '392',
      '--body',
      '@coderabbitai review',
    ]);
    // Polling continued to the deadline afterwards rather than returning early.
    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('does not trigger a review before the trigger instant', async () => {
    processRunner.run.mockResolvedValue(EMPTY);

    await runWait({
      ...OPTIONS,
      triggerAfterEpochSeconds: Math.floor(Date.now() / 1000) + 600,
      timeoutMs: 60_000,
      intervalMs: 30_000,
    });

    expect(triggerCalls()).toHaveLength(0);
  });

  it('never triggers a review when no trigger instant is given', async () => {
    processRunner.run.mockResolvedValue(EMPTY);

    await runWait({ ...OPTIONS, timeoutMs: 60_000, intervalMs: 30_000 });

    expect(triggerCalls()).toHaveLength(0);
  });

  it('does not retry the trigger when posting it fails', async () => {
    processRunner.run.mockResolvedValue(EMPTY);
    processRunner.run.mockImplementation((_command, args) =>
      args[1] === 'comment'
        ? Promise.resolve({ exitCode: 1, stdout: '', stderr: 'no such PR' })
        : Promise.resolve(EMPTY),
    );

    const result = await runWait({
      ...OPTIONS,
      triggerAfterEpochSeconds: Math.floor(Date.now() / 1000),
      timeoutMs: 120_000,
      intervalMs: 30_000,
    });

    expect(triggerCalls()).toHaveLength(1);
    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('survives a rejected trigger post and keeps polling', async () => {
    processRunner.run.mockImplementation((_command, args) =>
      args[1] === 'comment'
        ? Promise.reject(new Error('spawn gh ENOENT'))
        : Promise.resolve(EMPTY),
    );

    const result = await runWait({
      ...OPTIONS,
      triggerAfterEpochSeconds: Math.floor(Date.now() / 1000),
      timeoutMs: 60_000,
      intervalMs: 30_000,
    });

    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('does not trigger a review when a qualifying review is found first', async () => {
    processRunner.run.mockResolvedValue(FOUND);

    await runWait({
      ...OPTIONS,
      triggerAfterEpochSeconds: Math.floor(Date.now() / 1000),
      timeoutMs: 60_000,
      intervalMs: 30_000,
    });

    expect(triggerCalls()).toHaveLength(0);
  });
});
