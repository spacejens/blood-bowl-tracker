import { ProcessRunnerService } from '@blood-bowl-tracker/cli-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockProxy } from 'vitest-mock-extended';

import { WaitForPrReviewService } from './wait-for-pr-review.service';
import {
  COMPLETION_CANDIDATE,
  COMPLETION_REVIEW,
  completionResult,
  completionWithSection,
  createHarness,
  foundReview,
  HEAD_REF_OID,
  OPTIONS,
  REVIEW,
  rollingResult,
} from './wait-for-pr-review.test-helpers';

type RunResult = Awaited<ReturnType<ProcessRunnerService['run']>>;

/** The PR base the recent_review sentence starts its commit range from. */
const BASE_OID = 'e44832555c4036093c6dcb7c9ad9da576c8f6adc';
/** A head pushed after the reviews call read `HEAD_REF_OID`. */
const NEWER_HEAD_OID = '9f1c2b7e5a4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b';

/** A `gh pr view` result with no review-side match and the given head. */
function prViewWithHead(headRefOid: string): RunResult {
  return {
    exitCode: 0,
    stdout: `${JSON.stringify({ review: null, rateLimitComment: null, headRefOid })}\n`,
    stderr: '',
  };
}

/** A clean recent_review section whose commit range ends at `head`. */
function cleanSectionBetween(base: string, head: string): string {
  return (
    'No actionable comments were generated in the recent review. ' +
    'Reviewing files that changed from the base of the PR and between ' +
    `\`${base}\` and \`${head}\`.`
  );
}

describe('WaitForPrReviewService validated head on completion reviews', () => {
  let service: WaitForPrReviewService;
  let processRunner: MockProxy<ProcessRunnerService>;

  beforeEach(async () => {
    vi.useFakeTimers();
    ({ service, processRunner } = await createHarness());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Runs the wait to completion under fake timers (see the rolling-comment spec). */
  async function runWait(
    options: Parameters<WaitForPrReviewService['run']>[0],
    advanceMs = 15 * 60 * 1000,
  ): Promise<Awaited<ReturnType<WaitForPrReviewService['run']>>> {
    const pending = service.run(options);
    await vi.advanceTimersByTimeAsync(advanceMs);
    return pending;
  }

  /**
   * Routes one poll's two `gh` calls: `gh api .../comments` gets `comments`;
   * `gh pr view` gets the next entry of `prViews`, repeating the last one
   * once the list runs out.
   */
  function mockPolls(prViews: readonly RunResult[], comments: RunResult) {
    let prViewCalls = 0;
    processRunner.run.mockImplementation((_command, args) => {
      if (args[0] === 'api') {
        return Promise.resolve(comments);
      }
      const index = Math.min(prViewCalls, prViews.length - 1);
      prViewCalls += 1;
      return Promise.resolve(prViews[index]);
    });
  }

  it('carries the head its recent_review section was validated against as commit.oid', async () => {
    mockPolls(
      [prViewWithHead(HEAD_REF_OID)],
      completionResult(COMPLETION_CANDIDATE),
    );

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toEqual({ found: true, review: COMPLETION_REVIEW });
    expect(result).toMatchObject({
      review: { commit: { oid: HEAD_REF_OID } },
    });
  });

  it('rejects a section naming only a head pushed after the head was read', async () => {
    // The reviews call read HEAD_REF_OID; by the rolling-comment call a newer
    // head was pushed and reviewed. That section does not name the head this
    // poll validated against, so it is not accepted.
    mockPolls(
      [prViewWithHead(HEAD_REF_OID)],
      completionWithSection(cleanSectionBetween(BASE_OID, NEWER_HEAD_OID)),
    );

    const result = await runWait({
      ...OPTIONS,
      intervalMs: 30_000,
      timeoutMs: 60_000,
    });

    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('returns the head the poll read, never a later one the section also names', async () => {
    mockPolls(
      [prViewWithHead(HEAD_REF_OID)],
      completionWithSection(cleanSectionBetween(HEAD_REF_OID, NEWER_HEAD_OID)),
    );

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toMatchObject({
      found: true,
      review: { commit: { oid: HEAD_REF_OID } },
    });
  });

  it('validates each poll against the head that same poll read', async () => {
    // Poll 1 reads the old head and rejects the section; poll 2 reads the new
    // head, which the section names, and returns that head.
    mockPolls(
      [prViewWithHead(HEAD_REF_OID), prViewWithHead(NEWER_HEAD_OID)],
      completionWithSection(cleanSectionBetween(BASE_OID, NEWER_HEAD_OID)),
    );

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toMatchObject({
      found: true,
      review: { commit: { oid: NEWER_HEAD_OID } },
    });
    // Two polls of two gh calls each.
    expect(processRunner.run).toHaveBeenCalledTimes(4);
  });

  it('returns nothing when the comment was edited so its section no longer names the head', async () => {
    // The head was read as HEAD_REF_OID, but the rolling comment's section
    // now describes a range ending at some other commit.
    mockPolls(
      [prViewWithHead(HEAD_REF_OID)],
      completionWithSection(
        cleanSectionBetween(
          BASE_OID,
          '0000000000000000000000000000000000000000',
        ),
      ),
    );

    const result = await runWait({
      ...OPTIONS,
      intervalMs: 30_000,
      timeoutMs: 60_000,
    });

    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('passes a formal review through unchanged, keeping its own commit.oid', async () => {
    // The formal review is of a different commit than the head the poll read;
    // the service must not overwrite it with the poll's head.
    const formal = { ...REVIEW, commit: { oid: NEWER_HEAD_OID } };
    mockPolls([foundReview(formal)], rollingResult({}));

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toEqual({ found: true, review: formal });
  });
});
