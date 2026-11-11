import { Injectable } from '@nestjs/common';

/** A sentence must mention one of these to be read as stating a wait time. */
const WAIT_TIME_KEYWORDS = /\b(again|retry|available|resets|wait|before)\b/i;
/** The duration itself: a number followed by a minute/hour unit. */
const WAIT_TIME_DURATION = /(\d+)\s*(minute|hour)s?\b/i;

/**
 * Added to every parsed wait time. CodeRabbit's own rate-limit window can
 * slip slightly past the duration its comment announced, so retrying at
 * exactly the stated instant costs more than a wasted poll: the retry lands
 * on the boundary CodeRabbit itself is crossing, where a state check can
 * misread "not available yet" for a review that is seconds away. One minute
 * of slack removes that race. Applied only when a duration was actually
 * parsed — see `availableAt`.
 */
const RATE_LIMIT_WAIT_BUFFER_SECONDS = 60;

/** The parts of a CodeRabbit rate-limit comment its wait time is read from. */
export interface RateLimitNotice {
  /** The comment body, or the rate-limit section of the rolling comment. */
  readonly body: string;
  /** When the comment was posted or last edited; the wait is anchored to it. */
  readonly submittedAt: string;
}

/**
 * Reads when CodeRabbit says reviews resume from its rate-limit wording.
 * Pure and dependency-free, so `WaitForPrReviewService`'s specs pass it as a
 * real provider and assert on the epochs it computes.
 */
@Injectable()
export class RateLimitWaitTimeService {
  /**
   * Best-effort only. Splits the body into sentences (and lines), keeps those
   * that mention a wait-time keyword, and takes the first duration found in
   * one of them — scoping it this way keeps an unrelated "3 minutes"
   * elsewhere in the comment from being read as the wait. First match wins;
   * hours convert to minutes. No match means the caller applies its own
   * default.
   *
   * Anchored to the comment's own `submittedAt`, not `Date.now()`: a
   * stale/re-matched comment (e.g. re-found across a retry) must not be
   * read as if its wait were freshly starting now.
   *
   * The returned epoch is deliberately `RATE_LIMIT_WAIT_BUFFER_SECONDS` past
   * the stated wait: CodeRabbit's own window can slip past what it announced,
   * so retrying exactly on time risks both a wasted poll and a state-check
   * race right at the boundary. Buffering here rather than at the call sites
   * means every consumer of `availableAtEpochSeconds` — including
   * develop-feature's Phase 6 retry trigger and the timeout it derives from
   * that trigger — gets the slack for free. The `undefined` return below is
   * never buffered: with no duration parsed there is nothing to buffer, and
   * the caller's own default applies instead.
   */
  availableAt(notice: RateLimitNotice): number | undefined {
    for (const sentence of notice.body.split(/(?<=[.!?])\s+|\n+/)) {
      if (!WAIT_TIME_KEYWORDS.test(sentence)) continue;
      const match = WAIT_TIME_DURATION.exec(sentence);
      if (match === null) continue;
      const minutes =
        match[2].toLowerCase() === 'hour'
          ? Number(match[1]) * 60
          : Number(match[1]);
      return (
        Math.floor(new Date(notice.submittedAt).getTime() / 1000) +
        minutes * 60 +
        RATE_LIMIT_WAIT_BUFFER_SECONDS
      );
    }
    return undefined;
  }
}
