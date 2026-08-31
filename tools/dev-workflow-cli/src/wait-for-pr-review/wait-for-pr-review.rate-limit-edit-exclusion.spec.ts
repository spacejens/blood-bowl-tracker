import { ProcessRunnerService } from '@blood-bowl-tracker/cli-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockProxy } from 'vitest-mock-extended';

import { WaitForPrReviewService } from './wait-for-pr-review.service';
import {
  createHarness,
  EMPTY,
  extractRateLimitFilter,
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
 * `rateLimitFilter` (GraphQL, via `gh pr view`), which reports the comment's
 * *raw* id, and `rateLimitEditFilter`/`rateLimitEditComment` (REST, via
 * `gh api`), which reports a composite id pairing that raw id with a
 * fingerprint of the extracted section.
 *
 * Before this exclusion existed they collided whenever CodeRabbit rate-limited
 * a pass before any `recent_review` section had been written — the comment
 * carried `RATE_LIMIT_EDIT_START_MARKER` but not yet
 * `RECENT_REVIEW_START_MARKER`, so the GraphQL detector matched it too. The
 * caller round-tripping either id as `--exclude-comment-id` then suppressed
 * only one of the two detectors, and the wait alternated between the two id
 * forms indefinitely (issue #687).
 *
 * Excluding the marker from `rateLimitFilter` gives the rolling-edit detector
 * exclusive ownership of that comment, so the two id spaces never collide.
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
    const subFilter = extractRateLimitFilter(jqProgramOf(args));
    expect(subFilter).toContain(
      `contains(${JSON.stringify(RATE_LIMIT_EDIT_START_MARKER)}) | not`,
    );
  });

  it('reports only the rolling detector composite id when both detectors see the same rate-limit comment', async () => {
    // The collision scenario from issue #687: the reviews call's own match
    // carries the rate-limit-edit marker (so it is really the rolling
    // walkthrough comment, not a standalone notice), and the rolling call
    // reports the same underlying comment behind its composite id. The
    // caller must only ever see the composite form — the raw-id shape must
    // never surface, or round-tripping it as `--exclude-comment-id` would
    // suppress neither detector consistently.
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
});
