import { ProcessRunnerService } from '@blood-bowl-tracker/cli-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockProxy } from 'vitest-mock-extended';

import { WaitForPrReviewService } from './wait-for-pr-review.service';
import {
  createHarness,
  EMPTY,
  extractCommentUpdateFailedFilter,
  extractRateLimitFilter,
  extractStarGateFilter,
  jqProgramOf,
  OPTIONS,
  RATE_LIMIT_COMMENT,
  RATE_LIMIT_EDIT_CANDIDATE,
  RATE_LIMIT_EDIT_SECTION,
  RATE_LIMITED,
  rateLimitEditResult,
  rateLimitedWithBody,
  rollingResult,
} from './wait-for-pr-review.test-helpers';

/**
 * Opens the block CodeRabbit edits into its *existing* rolling walkthrough
 * comment when it rate-limits a re-review. Written out as a literal rather
 * than imported: the constant is module-private to
 * `wait-for-pr-review-filters.service.ts`, and asserting on the literal is
 * what pins the exact text the built jq program has to carry — the same way
 * `wait-for-pr-review.command-reply.spec.ts` asserts on the literal
 * command-reply marker.
 */
const RATE_LIMIT_EDIT_START_MARKER =
  '<!-- This is an auto-generated comment: rate limited by coderabbit.ai -->';

/**
 * Two independent detectors can see the same CodeRabbit rate-limit notice:
 * `rateLimitFilter` (GraphQL), which reports the comment's raw id, and
 * `rateLimitEditFilter`/`rateLimitEditComment` (REST), which reports a
 * composite id pairing that raw id with a fingerprint of the extracted
 * section. Excluding the marker from `rateLimitFilter` gives the rolling-edit
 * detector exclusive ownership of that comment, so the two id spaces never
 * collide.
 */
describe('WaitForPrReviewService rate-limit-edit exclusion', () => {
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

  it('excludes the rate-limit-edit marker from the rate-limit jq clause', async () => {
    processRunner.run.mockImplementation((_command, args) =>
      Promise.resolve(args[0] === 'api' ? rollingResult({}) : EMPTY),
    );

    await runWait({ ...OPTIONS, timeoutMs: 30_000, intervalMs: 30_000 });

    const [, args] = processRunner.run.mock.calls[0];
    const program = jqProgramOf(args);
    const subFilter = extractRateLimitFilter(program);
    expect(subFilter).toContain(
      `contains(${JSON.stringify(RATE_LIMIT_EDIT_START_MARKER)}) | not`,
    );

    // The exclusion belongs to rateLimitFilter alone — it must not leak into
    // the sibling sub-filters built from the same jq program, even though
    // commentUpdateFailedFilter carries a visually near-identical
    // COMMAND_REPLY_MARKER exclusion line.
    expect(extractCommentUpdateFailedFilter(program)).not.toContain(
      `contains(${JSON.stringify(RATE_LIMIT_EDIT_START_MARKER)}) | not`,
    );
    expect(extractStarGateFilter(program)).not.toContain(
      `contains(${JSON.stringify(RATE_LIMIT_EDIT_START_MARKER)}) | not`,
    );
  });

  it('reports only the rolling detector composite id when both detectors see the same rate-limit comment', async () => {
    // Both detectors see the same rate-limited comment; the caller must only
    // ever see the composite id — the raw-id form must never surface.
    processRunner.run.mockImplementation((_command, args) =>
      Promise.resolve(
        args[0] === 'api'
          ? rateLimitEditResult(RATE_LIMIT_EDIT_CANDIDATE)
          : rateLimitedWithBody(
              `${RATE_LIMIT_EDIT_START_MARKER}\n\n> [!WARNING]\n> Review limit reached.`,
            ),
      ),
    );

    const result = await runWait({
      ...OPTIONS,
      timeoutMs: 30_000,
      intervalMs: 30_000,
    });

    expect(result).toMatchObject({
      found: false,
      rateLimited: true,
      rateLimitComment: { body: RATE_LIMIT_EDIT_SECTION },
    });
    // The composite id pairs the raw comment id with a section fingerprint;
    // asserting the prefix rather than the hash keeps the test from encoding
    // a SHA-1 digest that would have to change with the fixture's section
    // text.
    expect(result.rateLimitComment?.id).toMatch(
      new RegExp(`^${RATE_LIMIT_EDIT_CANDIDATE.id}@`),
    );
    expect(result.rateLimitComment?.id).not.toBe(RATE_LIMIT_COMMENT.id);
  });

  it('a real standalone notice carrying no rate-limit-edit marker is still matched normally', async () => {
    // Sanity check that the new exclusion clause does not accidentally
    // suppress a genuine, spontaneous rate-limit notice — the same guard
    // `wait-for-pr-review.command-reply.spec.ts` keeps for its own marker.
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

  it('continues to timeout, not a false rate-limited result, when the REST call fails and the reviews call has no match', async () => {
    // The new exclusion gives the REST-based rolling-edit detector exclusive
    // ownership of a rate-limit edited into the rolling comment. If that
    // REST call itself fails or times out on a poll, this fixture models the
    // reviews call finding nothing either — so the poll must report nothing
    // found rather than fabricating a result, and the wait runs to its
    // timeout rather than losing correctness.
    processRunner.run.mockImplementation((_command, args) =>
      Promise.resolve(
        args[0] === 'api'
          ? { exitCode: 1, stdout: '', stderr: 'gh: API rate limit exceeded' }
          : EMPTY,
      ),
    );

    const result = await runWait({
      ...OPTIONS,
      timeoutMs: 30_000,
      intervalMs: 30_000,
    });

    expect(result).toEqual({ found: false, timedOut: true });
  });
});
