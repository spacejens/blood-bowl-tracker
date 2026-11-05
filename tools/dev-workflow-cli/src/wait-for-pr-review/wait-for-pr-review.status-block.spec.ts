import { ProcessRunnerService } from '@blood-bowl-tracker/cli-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockProxy } from 'vitest-mock-extended';

import { WaitForPrReviewService } from './wait-for-pr-review.service';
import {
  COMPLETION_CANDIDATE,
  COMPLETION_REVIEW,
  completionResult,
  createHarness,
  EMPTY,
  HEAD_REF_OID,
  jqProgramOf,
  OPTIONS,
  RATE_LIMIT_EDIT_CANDIDATE,
  rateLimitEditResult,
} from './wait-for-pr-review.test-helpers';

/**
 * The status block at the very top of CodeRabbit's rolling walkthrough
 * comment, as jq captures it between `<!-- recent_review_status_start -->`
 * and `<!-- recent_review_status_end -->` — real text observed in practice.
 */
const CLEAN_STATUS =
  '\n\nNo actionable comments were generated in the recent review.\n\n';

/**
 * The `recent_review` section of the same real comment, abridged: run
 * configuration and the reviewed commit range (ending in the PR's full head
 * SHA), but no verdict of its own.
 */
const SECTION_WITHOUT_VERDICT =
  '\n\n<details>\n<summary>📜 Recent review details</summary>\n\n' +
  '**Configuration used**: defaults\n\n**Review profile**: CHILL\n\n' +
  '<details>\n<summary>📥 Commits</summary>\n\n' +
  'Reviewing files that changed from the base of the PR and between ' +
  `\`e44832555c4036093c6dcb7c9ad9da576c8f6adc\` and \`${HEAD_REF_OID}\`.\n\n` +
  '</details>\n\n</details>\n\n';

/** What the completion jq filter emits for that comment. */
const STATUS_BLOCK_CANDIDATE = {
  ...COMPLETION_CANDIDATE,
  section: SECTION_WITHOUT_VERDICT,
  status: CLEAN_STATUS,
};

describe('WaitForPrReviewService completion verdict in the status block', () => {
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

  /** Every poll answers the same way: no formal review, this rolling comment. */
  function mockPoll(candidate: unknown) {
    processRunner.run.mockImplementation((_command, args) =>
      Promise.resolve(args[0] === 'api' ? completionResult(candidate) : EMPTY),
    );
  }

  /** A wait short enough to time out after two polls. */
  const SHORT_WAIT = { ...OPTIONS, timeoutMs: 60_000, intervalMs: 30_000 };

  it('detects a clean pass whose verdict sits only in the status block', async () => {
    mockPoll(STATUS_BLOCK_CANDIDATE);

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toEqual({ found: true, review: COMPLETION_REVIEW });
  });

  it('still detects a clean pass whose verdict sits only in the recent_review section', async () => {
    mockPoll(COMPLETION_CANDIDATE);

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toEqual({ found: true, review: COMPLETION_REVIEW });
  });

  it('does not treat a status block reporting findings as a completion', async () => {
    mockPoll({
      ...STATUS_BLOCK_CANDIDATE,
      status: '\n\nActionable comments posted: 2\n\n',
    });

    const result = await runWait(SHORT_WAIT);

    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('does not treat a clean status block as a completion when the section names a stale head commit', async () => {
    mockPoll({
      ...STATUS_BLOCK_CANDIDATE,
      section: SECTION_WITHOUT_VERDICT.replace(HEAD_REF_OID, '0'.repeat(40)),
    });

    const result = await runWait(SHORT_WAIT);

    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('does not treat a status-block phrase found only inside code formatting as a completion', async () => {
    mockPoll({
      ...STATUS_BLOCK_CANDIDATE,
      status: 'Reworded the `no actionable comments` branch of the detector.',
    });

    const result = await runWait(SHORT_WAIT);

    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('discards a completion candidate missing its status field', async () => {
    // `undefined` drops the key from the JSON jq would have emitted.
    mockPoll({ ...STATUS_BLOCK_CANDIDATE, status: undefined });

    const result = await runWait(SHORT_WAIT);

    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('captures the status block and tests the phrase in it or the section', async () => {
    mockPoll(STATUS_BLOCK_CANDIDATE);

    await runWait({ ...OPTIONS, intervalMs: 30_000 });

    const apiCall = processRunner.run.mock.calls.find(
      ([, args]) => args[0] === 'api',
    );
    expect(apiCall).toBeDefined();
    const program = jqProgramOf(apiCall?.[1] ?? []);
    expect(program).toContain(
      JSON.stringify(
        '<!-- recent_review_status_start -->(?<status>[\\s\\S]*?)<!-- recent_review_status_end -->',
      ),
    );
    expect(program).toContain('.status // "")');
    const phrase = JSON.stringify(
      'no actionable comments|no actionable issues|nothing to report|no comments were generated',
    );
    expect(program).toContain(
      `select((.status | test(${phrase}; "i")) or (.section | test(${phrase}; "i")))`,
    );
    // The walkthrough marker is still what identifies the rolling comment.
    expect(program).toContain('contains("<!-- recent_review_start -->")');
  });

  it('ends a re-triggered wait on a clean status-block pass once the excluded rate-limit block is gone', async () => {
    // First wait: CodeRabbit rate-limits by editing its rolling comment.
    processRunner.run.mockImplementation((_command, args) =>
      Promise.resolve(
        args[0] === 'api'
          ? rateLimitEditResult(RATE_LIMIT_EDIT_CANDIDATE)
          : EMPTY,
      ),
    );
    const first = await runWait({ ...OPTIONS, intervalMs: 30_000 });
    const excludeCommentId = first.rateLimitComment?.id;
    expect(excludeCommentId).toBeDefined();

    // Retry: the first poll still sees the already-excluded block; CodeRabbit
    // then rewrites the same comment into a clean walkthrough, with no formal
    // review ever submitted.
    let rollingPolls = 0;
    processRunner.run.mockImplementation((_command, args) => {
      if (args[0] !== 'api') {
        return Promise.resolve(EMPTY);
      }
      rollingPolls += 1;
      return Promise.resolve(
        rollingPolls === 1
          ? rateLimitEditResult(RATE_LIMIT_EDIT_CANDIDATE)
          : completionResult(STATUS_BLOCK_CANDIDATE),
      );
    });

    const second = await runWait({
      ...OPTIONS,
      excludeCommentId,
      intervalMs: 30_000,
    });

    expect(second).toEqual({ found: true, review: COMPLETION_REVIEW });
    expect(rollingPolls).toBe(2);
  });
});
