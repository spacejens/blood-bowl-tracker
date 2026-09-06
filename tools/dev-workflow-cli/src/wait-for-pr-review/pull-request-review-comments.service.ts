import { ProcessRunnerService } from '@blood-bowl-tracker/cli-shared';
import { Injectable } from '@nestjs/common';

/**
 * `gh pr view --json reviews` reports a review's `body` but no detail about
 * its inline (line) comments, so answering "did this review actually say
 * anything new?" needs this separate GraphQL hop, keyed by the very `PRR_...`
 * node id that same payload already returns. Each comment's `replyTo` is what
 * separates a genuinely new finding from a reply continuing an existing
 * thread; `first: 100` is a bounded, practically-exhaustive page — a review
 * with more than 100 inline comments is not a realistic case here.
 */
const GENUINE_COMMENT_QUERY =
  'query($id: ID!) { node(id: $id) { ... on PullRequestReview ' +
  '{ comments(first: 100) { nodes { replyTo { id } } } } } }';

/** Counts the fetched comments that are not replies, printing a bare integer. */
const GENUINE_COMMENT_JQ =
  '[.data.node.comments.nodes[] | select(.replyTo == null)] | length';

/**
 * Whether a given pull-request review carries any *genuinely new* inline
 * comments — top-level findings about the diff, as opposed to replies
 * continuing threads that already existed. A reply is by construction a
 * continuation, never a fresh finding about the diff under review, so it is
 * not evidence that a review pass actually ran.
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
   * `true` when the review has at least one non-reply inline comment, `false`
   * when it has none (including a review whose only content is replies), and
   * `undefined` when the check itself could not be completed — a non-zero exit
   * (including `ProcessRunnerService`'s timeout code), empty output,
   * unparseable output, or a process that could not be spawned.
   *
   * Callers must treat `undefined` the same as `false` (fail closed): the
   * whole point of the check is to avoid trusting a review that cannot be
   * shown to carry new content, and an unverifiable one is exactly that. The
   * rejection is swallowed here rather than left to the caller so a `gh`
   * that cannot be spawned degrades one poll instead of aborting the wait.
   */
  async hasGenuineInlineComments(
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
          `query=${GENUINE_COMMENT_QUERY}`,
          '-f',
          `id=${reviewId}`,
          '--jq',
          GENUINE_COMMENT_JQ,
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
