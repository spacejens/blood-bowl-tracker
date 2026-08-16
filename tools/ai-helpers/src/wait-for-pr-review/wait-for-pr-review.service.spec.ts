import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockProxy } from 'vitest-mock-extended';

import {
  ProcessRunnerService,
  TIMED_OUT_EXIT_CODE,
} from '../shared/process-runner.service';
import { WaitForPrReviewService } from './wait-for-pr-review.service';
import {
  COMMENT_UPDATE_FAILED,
  COMMENT_UPDATE_FAILED_COMMENT,
  commentUpdateFailedWithBody,
  COMPLETION_CANDIDATE,
  COMPLETION_REVIEW,
  completionResult,
  completionWithSection,
  createHarness,
  EMPTY,
  FOUND,
  HEAD_REF_OID,
  OPTIONS,
  RATE_LIMIT_COMMENT,
  RATE_LIMIT_COMMENT_EPOCH_SECONDS,
  RATE_LIMITED,
  rateLimitedWithBody,
  REVIEW,
} from './wait-for-pr-review.test-helpers';

/**
 * Pulls just the `commentUpdateFailedComment: (...)` sub-expression out of
 * the whole `filter()` jq program (`args[6]`). `filter()` concatenates three
 * `{key: (subFilter), ...}` clauses into one string ending in
 * `, headRefOid: .headRefOid}`, so the sub-filter's own closing paren is the
 * one immediately before that fixed literal suffix — this mirrors that
 * construction rather than trying to balance parens generically. Extracting
 * the sub-filter lets assertions target this filter specifically, instead of
 * the whole program where a rate-limit-filter substring could make an
 * assertion pass even if this filter itself lacked it.
 */
function extractCommentUpdateFailedFilter(program: string): string {
  const startMarker = 'commentUpdateFailedComment: (';
  const endMarker = '), headRefOid: .headRefOid}';
  const start = program.indexOf(startMarker) + startMarker.length;
  const end = program.indexOf(endMarker, start);
  if (start < startMarker.length || end === -1) {
    throw new Error(
      `could not extract commentUpdateFailedComment sub-filter from: ${program}`,
    );
  }
  return program.slice(start, end);
}

/**
 * Same extraction as `extractCommentUpdateFailedFilter`, for the
 * `rateLimitComment: (...)` clause instead — its own closing paren is the
 * one immediately before `, commentUpdateFailedComment: (`.
 */
function extractRateLimitFilter(program: string): string {
  const startMarker = 'rateLimitComment: (';
  const endMarker = '), commentUpdateFailedComment: (';
  const start = program.indexOf(startMarker) + startMarker.length;
  const end = program.indexOf(endMarker, start);
  if (start < startMarker.length || end === -1) {
    throw new Error(
      `could not extract rateLimitComment sub-filter from: ${program}`,
    );
  }
  return program.slice(start, end);
}

describe('WaitForPrReviewService', () => {
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
   * rate-limit comment) and `gh api repos/.../comments` (completion comment).
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
      'reviews,comments,headRefOid',
      '--jq',
    ]);
    expect(args[6]).toContain('.author.login != "spacejens"');
    expect(args[6]).toContain('fromdateiso8601) >= 1760000000');
    expect(args[6]).toContain('headRefOid: .headRefOid');
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
      .mockResolvedValueOnce(EMPTY) // poll 1: reviews
      .mockResolvedValueOnce(EMPTY) // poll 1: completion comment
      .mockResolvedValueOnce(EMPTY) // poll 2: reviews
      .mockResolvedValueOnce(EMPTY) // poll 2: completion comment
      .mockResolvedValue(FOUND); // poll 3: reviews

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toEqual({ found: true, review: REVIEW });
    expect(processRunner.run).toHaveBeenCalledTimes(5);
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
    // call at that point, only report the timeout. Each of the 3 polls now
    // makes two calls (reviews, then the completion comment).
    expect(processRunner.run).toHaveBeenCalledTimes(6);
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
    // Two calls per poll (reviews, then the completion comment), each bounded by
    // the time left at the moment it is issued — identical within a poll.
    expect(budgets).toEqual([90_000, 90_000, 60_000, 60_000, 30_000, 30_000]);
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
    // than issuing a 21st `gh` call. 20 polls, two calls each.
    expect(processRunner.run).toHaveBeenCalledTimes(40);
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
    expect(args[4]).toBe('reviews,comments,headRefOid');
    expect(args[6]).toContain('.comments[]');
    expect(args[6]).toContain('test("coderabbit"; "i")');
    expect(args[6]).toContain(
      'test("rate limit|rate-limit|review limit|usage limit"; "i")',
    );
    expect(args[6]).toContain('(.createdAt | fromdateiso8601) >= 1760000000');
    expect(args[6]).toContain('submittedAt: .createdAt');
    // CodeRabbit's own rolling walkthrough comment can incidentally contain
    // this filter's phrase in prose (a summary, a changes table) — notably
    // on a PR whose diff is about rate-limit detection itself, which
    // produced a real false positive on issue #465's own PR — so the filter
    // must exclude any comment carrying the walkthrough's marker before it
    // could ever be mistaken for a genuine rate-limit notice. Extracted to
    // this filter's own sub-expression, not asserted against the whole
    // program, since `commentUpdateFailedFilter` carries the identical
    // substring and would make this assertion pass even if this filter
    // itself lacked the guard.
    const subFilter = extractRateLimitFilter(args[6]);
    expect(subFilter).toContain(
      'contains("<!-- recent_review_start -->") | not',
    );
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
    // Poll 1 makes both calls (reviews, then completion); poll 2 returns on
    // its first call.
    expect(processRunner.run).toHaveBeenCalledTimes(3);
  });

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
    // After the rate-limit candidate is discarded, poll 1 goes on to the
    // completion query, and poll 2's reviews call finds the review.
    expect(processRunner.run).toHaveBeenCalledTimes(3);
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

  it('discards a rate-limit candidate whose body is missing, not throws', async () => {
    // jq's own shape is asserted, not checked, by the `as PollOutcome`
    // cast on the reviews half — a malformed response from a future gh/jq
    // change must not crash the whole wait. Mirrors the completion half's
    // existing fail-soft handling via `parseCompletionCandidate`.
    processRunner.run
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: JSON.stringify({
          review: null,
          rateLimitComment: { id: RATE_LIMIT_COMMENT.id },
        }),
        stderr: '',
      })
      .mockResolvedValue(FOUND);

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toEqual({ found: true, review: REVIEW });
  });

  it('discards a rate-limit candidate whose id is missing, not throws', async () => {
    processRunner.run
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: JSON.stringify({
          review: null,
          rateLimitComment: {
            body: RATE_LIMIT_COMMENT.body,
            submittedAt: RATE_LIMIT_COMMENT.submittedAt,
          },
        }),
        stderr: '',
      })
      .mockResolvedValue(FOUND);

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toEqual({ found: true, review: REVIEW });
  });

  it('discards a rate-limit candidate whose submittedAt is missing, not throws', async () => {
    processRunner.run
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: JSON.stringify({
          review: null,
          rateLimitComment: {
            id: RATE_LIMIT_COMMENT.id,
            body: RATE_LIMIT_COMMENT.body,
          },
        }),
        stderr: '',
      })
      .mockResolvedValue(FOUND);

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toEqual({ found: true, review: REVIEW });
  });

  it('returns immediately when a qualifying comment-update-failure comment is found', async () => {
    processRunner.run.mockResolvedValue(COMMENT_UPDATE_FAILED);

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toEqual({
      found: false,
      commentUpdateFailed: true,
      commentUpdateFailedComment: COMMENT_UPDATE_FAILED_COMMENT,
    });
    // Returns on the first poll rather than waiting out the full timeout.
    expect(processRunner.run).toHaveBeenCalledTimes(1);
  });

  it('prefers a review over a comment-update-failure comment found in the same poll', async () => {
    processRunner.run.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({
        review: REVIEW,
        rateLimitComment: null,
        commentUpdateFailedComment: COMMENT_UPDATE_FAILED_COMMENT,
      }),
      stderr: '',
    });

    const result = await runWait(OPTIONS);

    expect(result).toEqual({ found: true, review: REVIEW });
  });

  it('prefers a rate-limit comment over a comment-update-failure comment found in the same poll', async () => {
    // Not expected in practice — the two describe different, mutually
    // exclusive events — but the ordering must be deterministic if it ever
    // happens, and the rate-limit result is the one that carries a wait time.
    processRunner.run.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({
        review: null,
        rateLimitComment: RATE_LIMIT_COMMENT,
        commentUpdateFailedComment: COMMENT_UPDATE_FAILED_COMMENT,
      }),
      stderr: '',
    });

    const result = await runWait(OPTIONS);

    expect(result).toMatchObject({ found: false, rateLimited: true });
    expect(result).not.toHaveProperty('commentUpdateFailed');
  });

  it('asks gh for CodeRabbit comment-update-failure wording at or after the watermark', async () => {
    processRunner.run.mockResolvedValue(FOUND);

    await runWait(OPTIONS);

    const [, args] = processRunner.run.mock.calls[0];
    expect(args[6]).toContain('commentUpdateFailedComment: (');
    expect(args[6]).toContain('could not update its existing comment');
    expect(args[6]).toContain('cannot update its existing comment');
    expect(args[6]).toContain('; "i")');
    expect(args[6]).toContain(
      '{id: .id, body: .body, submittedAt: .createdAt}',
    );
    // The author-login narrowing and the watermark bound are structurally
    // identical to the rate-limit filter's own, but that filter's substrings
    // sit in the same concatenated jq program — asserting against the whole
    // `args[6]` string would pass even if this filter itself omitted them.
    // Extracting just this filter's sub-expression keeps the assertion
    // specific to it.
    const subFilter = extractCommentUpdateFailedFilter(args[6]);
    expect(subFilter).toContain('test("coderabbit"; "i")');
    expect(subFilter).toContain('fromdateiso8601) >= 1760000000');
    // CodeRabbit's own rolling walkthrough comment can incidentally contain
    // this filter's phrase in prose (a summary, a changes table) — notably
    // on a PR whose diff is about this very phrase — so the filter must
    // exclude any comment carrying the walkthrough's marker before it could
    // ever be mistaken for a genuine failure notice.
    expect(subFilter).toContain(
      'contains("<!-- recent_review_start -->") | not',
    );
  });

  it('excludes the comment passed as excludeCommentUpdateFailureId', async () => {
    processRunner.run.mockResolvedValue(FOUND);

    await runWait({ ...OPTIONS, excludeCommentUpdateFailureId: 'IC_update1' });

    const [, args] = processRunner.run.mock.calls[0];
    expect(args[6]).toContain('.id != "IC_update1"');
  });

  it('keeps the two comment exclusions independent of each other', async () => {
    // A caller retrying after one kind of failure must not accidentally
    // suppress detection of the other kind on a later poll, so the two ids
    // are separate options producing separate clauses. Asserting only that
    // `.id != "IC_update1"` is absent is vacuous — that string can never
    // appear unless `excludeCommentUpdateFailureId` is set — so instead
    // check the comment-update-failure filter's own sub-expression carries
    // no exclusion clause at all when only `excludeCommentId` is given.
    processRunner.run.mockResolvedValue(FOUND);

    await runWait({ ...OPTIONS, excludeCommentId: 'IC_comment1' });

    const [, args] = processRunner.run.mock.calls[0];
    const subFilter = extractCommentUpdateFailedFilter(args[6]);
    expect(subFilter).not.toContain('.id !=');
  });

  it('does not treat the phrase found only inside a code span as a comment-update failure', async () => {
    // Same class of false positive the rate-limit path guards against: jq's
    // own phrase test is coarse, so the service re-checks with code
    // formatting stripped.
    processRunner.run
      .mockResolvedValueOnce(
        commentUpdateFailedWithBody(
          'Currently processing new changes in this PR.\n\n' +
            "Commit unit tests in branch `issue-410-couldn't-update-its-existing-comment`",
        ),
      )
      .mockResolvedValue(FOUND);

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toEqual({ found: true, review: REVIEW });
    // After the candidate is discarded, poll 1 goes on to the completion
    // query, and poll 2's reviews call finds the review.
    expect(processRunner.run).toHaveBeenCalledTimes(3);
  });

  it('still detects the failure stated in prose alongside an unrelated code span', async () => {
    processRunner.run.mockResolvedValue(
      commentUpdateFailedWithBody(
        "CodeRabbit couldn't update its existing comment. Error details: " +
          '`putComment timed out`.',
      ),
    );

    const result = await runWait(OPTIONS);

    expect(result).toMatchObject({ found: false, commentUpdateFailed: true });
  });

  it('detects the failure when CodeRabbit uses a typographic apostrophe', async () => {
    processRunner.run.mockResolvedValue(
      commentUpdateFailedWithBody(
        'CodeRabbit couldn’t update its existing comment. Error details: ' +
          'putComment timed out.',
      ),
    );

    const result = await runWait(OPTIONS);

    expect(result).toMatchObject({ found: false, commentUpdateFailed: true });
  });

  it('discards a comment-update-failure candidate whose body is missing, not throws', async () => {
    // The reviews half's shape is asserted, not checked, by its `as
    // PollOutcome` cast — a malformed response from a future gh/jq change
    // must not crash the whole wait.
    processRunner.run
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: JSON.stringify({
          review: null,
          rateLimitComment: null,
          commentUpdateFailedComment: { id: COMMENT_UPDATE_FAILED_COMMENT.id },
        }),
        stderr: '',
      })
      .mockResolvedValue(FOUND);

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toEqual({ found: true, review: REVIEW });
  });

  it('discards a comment-update-failure candidate whose id is missing, not throws', async () => {
    // prosePhraseComment previously validated only `body`, so a malformed
    // candidate with a matching phrase but no `id` would have been returned
    // as-is — leaving a b3 retry with an unusable exclusion value.
    processRunner.run
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: JSON.stringify({
          review: null,
          rateLimitComment: null,
          commentUpdateFailedComment: {
            body: COMMENT_UPDATE_FAILED_COMMENT.body,
            submittedAt: COMMENT_UPDATE_FAILED_COMMENT.submittedAt,
          },
        }),
        stderr: '',
      })
      .mockResolvedValue(FOUND);

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toEqual({ found: true, review: REVIEW });
  });

  it('discards a comment-update-failure candidate whose submittedAt is missing, not throws', async () => {
    // Same reasoning as the missing-id case above — a malformed candidate
    // with no submittedAt would leave a b3 retry with an unusable watermark.
    processRunner.run
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: JSON.stringify({
          review: null,
          rateLimitComment: null,
          commentUpdateFailedComment: {
            id: COMMENT_UPDATE_FAILED_COMMENT.id,
            body: COMMENT_UPDATE_FAILED_COMMENT.body,
          },
        }),
        stderr: '',
      })
      .mockResolvedValue(FOUND);

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toEqual({ found: true, review: REVIEW });
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

  it('still triggers a review when a stale rate-limit comment is found in the same poll', async () => {
    // A retry (develop-feature's Phase 6 step b2) sets `--trigger-after` to
    // force an immediate retrigger, but only excludes the one rate-limit
    // comment id it already knows about. If a second, still-unexcluded
    // rate-limit comment is found on the very first poll, the trigger must
    // still fire rather than being skipped by the early return below it.
    processRunner.run.mockResolvedValue(RATE_LIMITED);

    const result = await runWait({
      ...OPTIONS,
      triggerAfterEpochSeconds: Math.floor(Date.now() / 1000),
      timeoutMs: 60_000,
      intervalMs: 30_000,
    });

    expect(triggerCalls()).toHaveLength(1);
    expect(result).toMatchObject({ found: false, rateLimited: true });
  });

  it('still triggers a review when a stale comment-update-failure comment is found in the same poll', async () => {
    // Same reasoning as the rate-limit case above, for a b3 retry.
    processRunner.run.mockResolvedValue(COMMENT_UPDATE_FAILED);

    const result = await runWait({
      ...OPTIONS,
      triggerAfterEpochSeconds: Math.floor(Date.now() / 1000),
      timeoutMs: 60_000,
      intervalMs: 30_000,
    });

    expect(triggerCalls()).toHaveLength(1);
    expect(result).toMatchObject({ found: false, commentUpdateFailed: true });
  });

  it('returns a synthesized review when CodeRabbit reports no actionable comments', async () => {
    mockPoll(EMPTY, completionResult(COMPLETION_CANDIDATE));

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toEqual({ found: true, review: COMPLETION_REVIEW });
    // First poll only: the reviews call, then the comments call.
    expect(processRunner.run).toHaveBeenCalledTimes(2);
  });

  it('queries the issue-comments endpoint for the completion comment', async () => {
    mockPoll(EMPTY, completionResult(COMPLETION_CANDIDATE));

    await runWait({ ...OPTIONS, intervalMs: 30_000 });

    const [command, args] = processRunner.run.mock.calls[1];
    expect(command).toBe('gh');
    expect(args[0]).toBe('api');
    // `since` is backed off one second from the watermark (1_760_000_000), so a
    // comment edited in the watermark's own second cannot be dropped by
    // GitHub's own "after the given time" bound.
    expect(args[1]).toBe(
      'repos/{owner}/{repo}/issues/392/comments?per_page=100&since=2025-10-09T08:53:19.000Z',
    );
    expect(args[2]).toBe('--jq');
    expect(args[3]).toContain('test("coderabbit"; "i")');
    expect(args[3]).toContain('select(.updated_at != null)');
    expect(args[3]).toContain('contains("<!-- recent_review_start -->")');
    expect(args[3]).toContain('(.updated_at | fromdateiso8601) >= 1760000000');
    expect(args[3]).toContain('<!-- recent_review_end -->');
    expect(args[3]).toContain(
      'test("no actionable comments|no actionable issues|nothing to report|no comments were generated"; "i")',
    );
  });

  it('builds the completion id from the comment id and its updated_at epoch, so an edit in place reads as a new pass', async () => {
    mockPoll(EMPTY, completionResult(COMPLETION_CANDIDATE));

    await runWait({ ...OPTIONS, intervalMs: 30_000 });

    const [, args] = processRunner.run.mock.calls[1];
    expect(args[3]).toContain(
      '{id: ((.id | tostring) + "@" + ((.updated_at | fromdateiso8601) | tostring))',
    );
  });

  it('excludes the completion comment whose composite id was already surfaced', async () => {
    mockPoll(EMPTY, completionResult(COMPLETION_CANDIDATE));

    await runWait({
      ...OPTIONS,
      excludeReviewId: '5263781074@1786521319',
      intervalMs: 30_000,
    });

    const [, args] = processRunner.run.mock.calls[1];
    expect(args[3]).toContain('select(.id != "5263781074@1786521319")');
  });

  it('omits the completion id exclusion clause when excludeReviewId is not given', async () => {
    mockPoll(EMPTY, completionResult(COMPLETION_CANDIDATE));

    await runWait({ ...OPTIONS, intervalMs: 30_000 });

    const [, args] = processRunner.run.mock.calls[1];
    expect(args[3]).not.toContain('select(.id !=');
  });

  it('finds a genuinely new pass once the comment updated_at has advanced', async () => {
    // Same comment id, later `updated_at` — a different composite id, so the
    // prior pass's exclusion no longer covers it.
    const advanced = {
      ...COMPLETION_CANDIDATE,
      id: '5263781074@1786524000',
      submittedAt: '2026-08-12T08:40:00Z',
    };
    mockPoll(EMPTY, completionResult(advanced));

    const result = await runWait({
      ...OPTIONS,
      excludeReviewId: '5263781074@1786521319',
      intervalMs: 30_000,
    });

    expect(result).toEqual({
      found: true,
      review: {
        id: '5263781074@1786524000',
        submittedAt: '2026-08-12T08:40:00Z',
        author: { login: 'coderabbitai[bot]' },
      },
    });
  });

  it('does not treat a pass that found actionable comments as a completion', async () => {
    mockPoll(
      EMPTY,
      completionWithSection('\n\nActionable comments posted: 3\n\n'),
    );

    const result = await runWait({
      ...OPTIONS,
      timeoutMs: 60_000,
      intervalMs: 30_000,
    });

    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('does not treat a comment with no bounded section as a completion', async () => {
    // jq's `capture` found no `<!-- recent_review_end -->`, so the section is
    // empty and there is nothing to match a phrase against.
    mockPoll(EMPTY, completionWithSection(''));

    const result = await runWait({
      ...OPTIONS,
      timeoutMs: 60_000,
      intervalMs: 30_000,
    });

    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('does not treat a phrase found only inside code formatting as a completion', async () => {
    // Mirrors the rate-limit false positive from PR #399: jq's own phrase test
    // is coarse, so the service re-checks the section with code formatting
    // stripped.
    mockPoll(
      EMPTY,
      completionWithSection(
        'Reworded the `no actionable comments` branch of the detector.',
      ),
    );

    const result = await runWait({
      ...OPTIONS,
      timeoutMs: 60_000,
      intervalMs: 30_000,
    });

    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('still detects a completion stated in prose alongside an unrelated code span', async () => {
    mockPoll(
      EMPTY,
      completionWithSection(
        'No actionable comments were generated in the recent review. ' +
          '**Run ID**: `3ce701f8-21ed-4b28-9c81-506c53e9c0a3`. ' +
          'Reviewing files that changed from the base of the PR and between ' +
          `\`e44832555c4036093c6dcb7c9ad9da576c8f6adc\` and \`${HEAD_REF_OID}\`.`,
      ),
    );

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toMatchObject({ found: true });
  });

  it('recognizes a completion candidate whose section covers the PR current head commit', async () => {
    mockPoll(EMPTY, completionResult(COMPLETION_CANDIDATE));

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    // EMPTY carries headRefOid = HEAD_REF_OID, and COMPLETION_SECTION
    // contains that SHA verbatim, so the candidate is fresh.
    expect(result).toEqual({ found: true, review: COMPLETION_REVIEW });
  });

  it('does not treat a completion candidate as found when its section does not cover the PR current head commit', async () => {
    // The comment's `updated_at` advanced (e.g. an unrelated walkthrough
    // refresh) but the recent_review section still describes a stale pass:
    // it names some other SHA, never the PR's actual head commit.
    mockPoll(
      EMPTY,
      completionWithSection(
        'No actionable comments were generated in the recent review. ' +
          'Reviewing files that changed from the base of the PR and between ' +
          '`e44832555c4036093c6dcb7c9ad9da576c8f6adc` and ' +
          '`0000000000000000000000000000000000000000`.',
      ),
    );

    const result = await runWait({
      ...OPTIONS,
      timeoutMs: 60_000,
      intervalMs: 30_000,
    });

    // Not found — the candidate is stale, so polling continues to timeout.
    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('does not treat a completion candidate as found when the current head commit is unknown', async () => {
    // The reviews call's own headRefOid field failed to parse (e.g. the
    // widened --json output was somehow malformed) — fail closed rather than
    // trust an unverifiable completion candidate.
    mockPoll(
      {
        exitCode: 0,
        stdout: '{"review":null,"rateLimitComment":null}\n',
        stderr: '',
      },
      completionResult(COMPLETION_CANDIDATE),
    );

    const result = await runWait({
      ...OPTIONS,
      timeoutMs: 60_000,
      intervalMs: 30_000,
    });

    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('treats an empty completion-query result as not found', async () => {
    // The most common real-world response: no qualifying comment, so
    // `[] | first` prints `null`/empty stdout rather than a JSON object.
    mockPoll(EMPTY, { exitCode: 0, stdout: '', stderr: '' });

    const result = await runWait({
      ...OPTIONS,
      timeoutMs: 60_000,
      intervalMs: 30_000,
    });

    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('treats a jq null completion-query result as not found', async () => {
    mockPoll(EMPTY, { exitCode: 0, stdout: 'null\n', stderr: '' });

    const result = await runWait({
      ...OPTIONS,
      timeoutMs: 60_000,
      intervalMs: 30_000,
    });

    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('ignores a completion payload missing the fields the filter should have produced', async () => {
    mockPoll(EMPTY, completionResult({ id: 42, submittedAt: null }));

    const result = await runWait({
      ...OPTIONS,
      timeoutMs: 60_000,
      intervalMs: 30_000,
    });

    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('ignores a completion payload with valid base fields but no usable author', async () => {
    // parseSectionCandidate's shared id/submittedAt/section checks pass here,
    // so this is the only case that actually reaches parseCompletionCandidate's
    // own author validation.
    mockPoll(
      EMPTY,
      completionResult({ ...COMPLETION_CANDIDATE, author: undefined }),
    );

    const result = await runWait({
      ...OPTIONS,
      timeoutMs: 60_000,
      intervalMs: 30_000,
    });

    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('prefers a formal review over a completion comment, and never even asks for one', async () => {
    mockPoll(FOUND, completionResult(COMPLETION_CANDIDATE));

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toEqual({ found: true, review: REVIEW });
    expect(processRunner.run).toHaveBeenCalledTimes(1);
  });

  it('prefers a rate-limit comment over a completion comment, and never even asks for one', async () => {
    mockPoll(RATE_LIMITED, completionResult(COMPLETION_CANDIDATE));

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toMatchObject({ found: false, rateLimited: true });
    expect(processRunner.run).toHaveBeenCalledTimes(1);
  });

  it('skips the rolling-comment query when the reviews call itself failed', async () => {
    // A broken or stalled `gh` is retried wholesale on the next interval; it
    // must not also double the number of calls each poll makes.
    processRunner.run.mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: 'could not resolve host',
    });

    const result = await runWait({
      ...OPTIONS,
      timeoutMs: 60_000,
      intervalMs: 30_000,
    });

    expect(result).toEqual({ found: false, timedOut: true });
    // Two polls, one call each — not four.
    expect(processRunner.run).toHaveBeenCalledTimes(2);
  });

  it('tolerates a failing rolling-comment query and retries on the next interval', async () => {
    processRunner.run.mockImplementation((_command, args) =>
      Promise.resolve(
        args[0] === 'api'
          ? { exitCode: 1, stdout: '', stderr: 'HTTP 502' }
          : EMPTY,
      ),
    );

    const result = await runWait({
      ...OPTIONS,
      timeoutMs: 60_000,
      intervalMs: 30_000,
    });

    expect(result).toEqual({ found: false, timedOut: true });
  });
});
