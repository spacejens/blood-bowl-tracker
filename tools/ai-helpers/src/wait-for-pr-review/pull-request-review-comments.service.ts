import { Injectable } from '@nestjs/common';

import { ProcessRunnerService } from '../shared/process-runner.service';

/**
 * `gh pr view --json reviews` reports a review's `body` but no count of its
 * inline (line) comments, so answering "did this review actually say
 * anything?" needs this separate GraphQL hop, keyed by the very `PRR_...`
 * node id that same payload already returns.
 */
const COMMENT_COUNT_QUERY =
  'query($id: ID!) { node(id: $id) { ... on PullRequestReview ' +
  '{ comments { totalCount } } } }';

/**
 * Whether a given pull-request review carries any inline comments.
 *
 * Exists as its own service rather than as a method on
 * `WaitForPrReviewService` for two reasons: that file is at this repo's
 * 500-line ceiling, and this is an independently testable unit of I/O with
 * nothing to do with poll scheduling.
 */
@Injectable()
export class PullRequestReviewCommentsService {
  constructor(private readonly processRunner: ProcessRunnerService) {}

  /**
   * `true` when the review has at least one inline comment, `false` when it
   * has none, and `undefined` when the check itself could not be completed —
   * a non-zero exit (including `ProcessRunnerService`'s timeout code), empty
   * output, unparseable output, or a process that could not be spawned.
   *
   * Callers must treat `undefined` the same as `false` (fail closed): the
   * whole point of the check is to avoid trusting a review that cannot be
   * shown to carry content, and an unverifiable one is exactly that. The
   * rejection is swallowed here rather than left to the caller so a `gh`
   * that cannot be spawned degrades one poll instead of aborting the wait.
   */
  async hasInlineComments(
    reviewId: string,
    timeoutMs: number,
  ): Promise<boolean | undefined> {
    let stdout: string;
    let exitCode: number;
    try {
      ({ stdout, exitCode } = await this.processRunner.run(
        'gh',
        [
          'api',
          'graphql',
          '-f',
          `query=${COMMENT_COUNT_QUERY}`,
          '-f',
          `id=${reviewId}`,
          '--jq',
          '.data.node.comments.totalCount',
        ],
        timeoutMs,
      ));
    } catch {
      return undefined;
    }
    if (exitCode !== 0) {
      return undefined;
    }
    const trimmed = stdout.trim();
    const total = Number(trimmed);
    // `Number('')` is 0, so the emptiness test cannot be folded into the
    // finiteness test — an empty stdout must read as "unknown", not "none".
    return trimmed === '' || !Number.isFinite(total) ? undefined : total > 0;
  }
}
