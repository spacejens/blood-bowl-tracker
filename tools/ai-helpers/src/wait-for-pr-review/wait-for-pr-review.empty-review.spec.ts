import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockProxy } from 'vitest-mock-extended';

import { ProcessRunnerService } from '../shared/process-runner.service';
import { PullRequestReviewCommentsService } from './pull-request-review-comments.service';
import { WaitForPrReviewService } from './wait-for-pr-review.service';
import {
  createHarness,
  EMPTY_BODY_FOUND,
  EMPTY_BODY_REVIEW,
  FOUND,
  foundReview,
  jqProgramOf,
  OPTIONS,
  REVIEW,
  rollingResult,
} from './wait-for-pr-review.test-helpers';

describe('WaitForPrReviewService empty-body artifact reviews', () => {
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
   * Routes the two `gh` calls one poll can make: `gh pr view` (formal review
   * + rate-limit comment) and `gh api repos/.../comments` (rolling comment).
   * Every poll answers the same way, so this models a steady state.
   */
  function mockPoll(
    prView: Awaited<ReturnType<ProcessRunnerService['run']>>,
    comments: Awaited<ReturnType<ProcessRunnerService['run']>>,
  ) {
    processRunner.run.mockImplementation((_command, args) =>
      Promise.resolve(args[0] === 'api' ? comments : prView),
    );
  }

  it('still reports an empty-body review that carries inline comments', async () => {
    mockPoll(EMPTY_BODY_FOUND, rollingResult({}));
    reviewComments.hasInlineComments.mockResolvedValue(true);

    const result = await runWait(OPTIONS);

    expect(result).toEqual({ found: true, review: EMPTY_BODY_REVIEW });
    expect(reviewComments.hasInlineComments).toHaveBeenCalledWith(
      'PRR_empty1',
      expect.any(Number),
    );
  });

  it('discards an empty-body review with no inline comments', async () => {
    mockPoll(EMPTY_BODY_FOUND, rollingResult({}));
    reviewComments.hasInlineComments.mockResolvedValue(false);

    const result = await runWait({
      ...OPTIONS,
      timeoutMs: 60_000,
      intervalMs: 30_000,
    });

    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('discards an empty-body review when the comment lookup itself fails', async () => {
    mockPoll(EMPTY_BODY_FOUND, rollingResult({}));
    reviewComments.hasInlineComments.mockResolvedValue(undefined);

    const result = await runWait({
      ...OPTIONS,
      timeoutMs: 60_000,
      intervalMs: 30_000,
    });

    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('trusts a non-object review candidate as-is, without an inline-comment lookup', async () => {
    const nonObjectCandidate = 'not an object';
    mockPoll(foundReview(nonObjectCandidate), rollingResult({}));

    const result = await runWait(OPTIONS);

    expect(result).toEqual({ found: true, review: nonObjectCandidate });
    expect(reviewComments.hasInlineComments).not.toHaveBeenCalled();
  });

  it('trusts a review candidate missing a string id as-is, without an inline-comment lookup', async () => {
    const candidateWithoutId = {
      author: { login: 'coderabbitai' },
      state: 'COMMENTED',
      body: '',
      submittedAt: '2026-08-11T10:00:00Z',
    };
    mockPoll(foundReview(candidateWithoutId), rollingResult({}));

    const result = await runWait(OPTIONS);

    expect(result).toEqual({ found: true, review: candidateWithoutId });
    expect(reviewComments.hasInlineComments).not.toHaveBeenCalled();
  });

  it('never looks up inline comments for a review that has a body', async () => {
    processRunner.run.mockResolvedValue(FOUND);

    const result = await runWait(OPTIONS);

    expect(result).toEqual({ found: true, review: REVIEW });
    expect(reviewComments.hasInlineComments).not.toHaveBeenCalled();
  });

  it('keeps polling the rolling comment after discarding an artifact review', async () => {
    mockPoll(EMPTY_BODY_FOUND, rollingResult({}));
    reviewComments.hasInlineComments.mockResolvedValue(false);

    await runWait({ ...OPTIONS, timeoutMs: 30_000, intervalMs: 30_000 });

    // A discarded review must behave exactly like "nothing found yet": the
    // poll falls through to the rolling-comment `gh api` call instead of
    // returning early.
    const apiCalls = processRunner.run.mock.calls.filter(
      ([, args]) => args[0] === 'api',
    );
    expect(apiCalls.length).toBeGreaterThan(0);
  });

  it('excludes a discarded artifact review from the next poll, so a genuine later review is reached', async () => {
    processRunner.run
      .mockResolvedValueOnce(EMPTY_BODY_FOUND) // poll 1: the artifact review
      .mockResolvedValueOnce(rollingResult({})) // poll 1: rolling comment
      .mockResolvedValueOnce(FOUND); // poll 2: the genuine review
    reviewComments.hasInlineComments.mockResolvedValue(false);

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toEqual({ found: true, review: REVIEW });
    // Poll 2's jq program must exclude the id poll 1 discarded — jq's review
    // half always returns the *first* match, so without the exclusion poll 2
    // would re-match the same artifact forever.
    const prViewCalls = processRunner.run.mock.calls.filter(
      ([, args]) => args[0] === 'pr',
    );
    expect(jqProgramOf(prViewCalls[0][1])).not.toContain('.id !=');
    expect(jqProgramOf(prViewCalls[1][1])).toContain('.id != "PRR_empty1"');
    // The artifact is verified once, not re-verified on every later poll.
    expect(reviewComments.hasInlineComments).toHaveBeenCalledTimes(1);
  });

  it('keeps advancing the exclusion when a caller already passed one', async () => {
    processRunner.run
      .mockResolvedValueOnce(EMPTY_BODY_FOUND)
      .mockResolvedValueOnce(rollingResult({}))
      .mockResolvedValueOnce(FOUND);
    reviewComments.hasInlineComments.mockResolvedValue(false);

    await runWait({
      ...OPTIONS,
      excludeReviewId: 'PRR_previous',
      intervalMs: 30_000,
    });

    const prViewCalls = processRunner.run.mock.calls.filter(
      ([, args]) => args[0] === 'pr',
    );
    expect(jqProgramOf(prViewCalls[0][1])).toContain('.id != "PRR_previous"');
    expect(jqProgramOf(prViewCalls[1][1])).toContain('.id != "PRR_previous"');
    expect(jqProgramOf(prViewCalls[1][1])).toContain('.id != "PRR_empty1"');
  });

  it('does not let a discarded artifact drop the caller-supplied exclusion, letting an already-handled review re-match', async () => {
    // Poll 2's `gh pr view` mock simulates jq's own exclusion logic: it
    // returns the already-handled `PRR_previous` review only if the jq
    // program it was called with no longer excludes that id — i.e. only if
    // the caller's original `excludeReviewId` was dropped. On the buggy code
    // (which overwrites `excludeReviewId` with the discarded artifact's id),
    // poll 2's jq program excludes `PRR_empty1` but not `PRR_previous`, so
    // this mock reports `FOUND` (the `PRR_review1` fixture) as newly found —
    // standing in for jq re-matching the already-handled `PRR_previous`
    // review once its exclusion was lost — a real regression of the bug
    // this test guards against, where overwriting `excludeReviewId` instead
    // of layering `excludeReviewIds` on top of it drops the caller's own
    // exclusion. On the fixed code, poll 2's jq program still excludes
    // `PRR_previous`, so this mock reports nothing,
    // and the wait times out instead of returning a false `found: true`.
    processRunner.run.mockImplementation((_command, args) => {
      if (args[0] === 'api') {
        return Promise.resolve(rollingResult({}));
      }
      const jqProgram = jqProgramOf(args);
      if (jqProgram.includes('.id != "PRR_empty1"')) {
        // Poll 2 (or later): simulate jq re-matching the already-handled
        // review only when the original exclusion was lost.
        return Promise.resolve(
          jqProgram.includes('.id != "PRR_previous"')
            ? EMPTY_BODY_FOUND
            : FOUND,
        );
      }
      // Poll 1: the artifact review, not yet discarded.
      return Promise.resolve(EMPTY_BODY_FOUND);
    });
    reviewComments.hasInlineComments.mockResolvedValue(false);

    const result = await runWait({
      ...OPTIONS,
      excludeReviewId: 'PRR_previous',
      timeoutMs: 90_000,
      intervalMs: 30_000,
    });

    expect(result).toEqual({ found: false, timedOut: true });
  });
});

describe('jqProgramOf', () => {
  it('throws when the args array has no --jq flag', () => {
    expect(() =>
      jqProgramOf(['pr', 'view', '392', '--json', 'reviews']),
    ).toThrow();
  });
});
