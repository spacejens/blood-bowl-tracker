import { Injectable } from '@nestjs/common';

import { ProcessRunnerService } from '../shared/process-runner.service';

/** One wait's inputs; the optional fields fall back to the defaults below. */
export interface WaitForPrReviewOptions {
  readonly prNumber: string;
  /** The PR author's own login — their own reviews never qualify. */
  readonly developerLogin: string;
  /**
   * Reviews submitted at or after this instant qualify. Inclusive (`>=`),
   * not strict: `sinceEpochSeconds` has only second precision, so a strict
   * `>` would silently exclude a distinct review submitted in the same
   * second as the watermark it was derived from. `excludeReviewId` is what
   * actually prevents re-matching the review the watermark came from —
   * this bound alone cannot tell same-second reviews apart.
   */
  readonly sinceEpochSeconds: number;
  /** The review this wait's own watermark was derived from, if any — excluded even when it falls at or after `sinceEpochSeconds`. */
  readonly excludeReviewId?: string;
  /** A rate-limit comment already surfaced to the caller — excluded so a re-run does not re-match it forever. */
  readonly excludeCommentId?: string;
  readonly timeoutMs?: number;
  readonly intervalMs?: number;
}

/** A CodeRabbit comment reporting that its review rate limit was hit. */
export interface RateLimitComment {
  readonly id: string;
  readonly body: string;
  /** The comment's `createdAt`, renamed by the jq filter for symmetry with a review's `submittedAt`. */
  readonly submittedAt: string;
}

export interface WaitForPrReviewResult {
  readonly found: boolean;
  /** The first qualifying review; present only when `found` is true. */
  readonly review?: unknown;
  /** Present (and true) only when the wait ended on its timeout. */
  readonly timedOut?: boolean;
  /** True only when a qualifying CodeRabbit rate-limit comment was found instead of a review. */
  readonly rateLimited?: boolean;
  /** Present only when `rateLimited` is true. */
  readonly rateLimitComment?: RateLimitComment;
  /**
   * Best-effort epoch parsed from the comment body when it states a relative
   * duration ("available again in 45 minutes", "retry in 2 hours"). Absent
   * when no duration could be parsed — the caller is expected to fall back to
   * a default wait.
   */
  readonly availableAtEpochSeconds?: number;
}

/** What one poll saw; both fields absent means "nothing qualifying yet". */
interface PollOutcome {
  readonly review?: unknown;
  readonly rateLimitComment?: RateLimitComment;
}

/**
 * Tolerant, deliberately CodeRabbit-specific wording match. The exact
 * rate-limit comment text is unknown and may drift, so any one of these
 * phrases (case-insensitive) qualifies.
 */
const RATE_LIMIT_PHRASES = 'rate limit|rate-limit|review limit|usage limit';

/** A sentence must mention one of these to be read as stating a wait time. */
const WAIT_TIME_KEYWORDS = /\b(again|retry|available|resets)\b/i;
/** The duration itself: a number followed by a minute/hour unit. */
const WAIT_TIME_DURATION = /(\d+)\s*(minute|hour)s?\b/i;

/** 10 minutes — matches develop-feature Phase 6's original wait. */
const DEFAULT_TIMEOUT_MS = 600_000;
/** 30 seconds — matches develop-feature Phase 6's original poll interval. */
const DEFAULT_INTERVAL_MS = 30_000;

/**
 * Waits until someone other than the PR's author submits a review, or until
 * a timeout elapses. Exists as a single-command CLI subcommand because a
 * worktree-isolated session refuses to run the multi-line shell poll loop
 * this replaces. Silent while polling: the only output is the final JSON
 * result `main.ts` prints.
 *
 * Bot-agnostic by construction — it looks for *some* formal review object
 * from a non-author, never for a particular bot's name.
 *
 * The one exception is rate-limit detection: CodeRabbit answers its own
 * per-developer review rate limit with a top-level PR comment instead of a
 * review, so each poll also looks for that comment — narrowly, by
 * CodeRabbit's own login and wording — and returns immediately when it finds
 * one, rather than running out the whole timeout with nothing to report.
 */
@Injectable()
export class WaitForPrReviewService {
  constructor(private readonly processRunner: ProcessRunnerService) {}

  async run(options: WaitForPrReviewOptions): Promise<WaitForPrReviewResult> {
    const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    for (;;) {
      const outcome = await this.poll(options, deadline, intervalMs);
      if (outcome?.review !== undefined) {
        return { found: true, review: outcome.review };
      }
      if (outcome?.rateLimitComment !== undefined) {
        return this.rateLimitedResult(outcome.rateLimitComment);
      }
      if (Date.now() >= deadline) {
        return { found: false, timedOut: true };
      }
      await this.sleep(intervalMs);
    }
  }

  /**
   * One `gh` query, bounded to the time left before `deadline` — or, once
   * that budget is already exhausted, to one more `intervalMs` rather than
   * a near-zero budget. `ProcessRunnerService` clamps a zero/negative
   * `timeoutMs` to effectively "kill it almost immediately" rather than
   * "no timeout" — passing the exhausted remaining budget through as-is
   * would deny the loop's last poll any real chance to complete. The
   * last-chance floor at `intervalMs` gives it one, while still guaranteeing
   * at least one poll happens even for a zero/tiny overall `timeoutMs`.
   *
   * Returns the first qualifying review, or `undefined` when there is none,
   * the call failed, or it did not finish before its own bound — a
   * transient or stalled `gh` call is a reason to retry on the next
   * interval, never to abort the wait. Bounding every call this way
   * guarantees a result can never arrive long after `deadline` and be
   * mistaken for a fresh `found`.
   *
   * Both halves of the filter come back in one object, so rate-limit
   * detection costs no extra `gh` call.
   */
  private async poll(
    options: WaitForPrReviewOptions,
    deadline: number,
    intervalMs: number,
  ): Promise<PollOutcome | undefined> {
    const remainingMs = deadline - Date.now();
    const result = await this.processRunner.run(
      'gh',
      [
        'pr',
        'view',
        options.prNumber,
        '--json',
        'reviews,comments',
        '--jq',
        this.filter(options),
      ],
      remainingMs > 0 ? remainingMs : intervalMs,
    );
    if (result.exitCode !== 0) {
      return undefined;
    }
    const stdout = result.stdout.trim();
    if (stdout === '' || stdout === 'null') {
      return undefined;
    }
    let parsed: PollOutcome | null;
    try {
      parsed = JSON.parse(stdout) as PollOutcome | null;
    } catch {
      return undefined;
    }
    if (parsed === null || typeof parsed !== 'object') {
      return undefined;
    }
    // jq emits `null` for an empty half; normalise both to `undefined` so
    // callers can test them with a single `!== undefined`.
    return {
      ...(parsed.review == null ? {} : { review: parsed.review }),
      ...(parsed.rateLimitComment == null
        ? {}
        : { rateLimitComment: parsed.rateLimitComment }),
    };
  }

  /**
   * One object per poll, holding both halves of the query. Each half is
   * wrapped in `[...] | first` so it emits exactly one JSON value (the first
   * match, or `null`). A bare `.reviews[] | select(...)` streams one document
   * per match, which is not parseable as a whole when more than one matches.
   */
  private filter(options: WaitForPrReviewOptions): string {
    return (
      `{review: (${this.reviewFilter(options)}), ` +
      `rateLimitComment: (${this.rateLimitFilter(options)})}`
    );
  }

  /** Bot-agnostic by construction: any formal review object from a non-author. */
  private reviewFilter(options: WaitForPrReviewOptions): string {
    const login = JSON.stringify(options.developerLogin);
    const excludeClause =
      options.excludeReviewId === undefined
        ? ''
        : ` and .id != ${JSON.stringify(options.excludeReviewId)}`;
    return (
      '[.reviews[] | select(.submittedAt != null) | ' +
      `select(.author.login != ${login} and ` +
      `(.submittedAt | fromdateiso8601) >= ${options.sinceEpochSeconds}` +
      `${excludeClause})] | first`
    );
  }

  /**
   * Deliberately CodeRabbit-specific — this failure mode and its comment
   * shape are CodeRabbit's own behaviour, unlike review detection above.
   */
  private rateLimitFilter(options: WaitForPrReviewOptions): string {
    const excludeClause =
      options.excludeCommentId === undefined
        ? ''
        : ` and .id != ${JSON.stringify(options.excludeCommentId)}`;
    return (
      '[.comments[] | select(.createdAt != null) | ' +
      'select((.author.login // "") | test("coderabbit"; "i")) | ' +
      `select(((.body // "") | test(${JSON.stringify(RATE_LIMIT_PHRASES)}; "i")) and ` +
      `(.createdAt | fromdateiso8601) >= ${options.sinceEpochSeconds}` +
      `${excludeClause}) | ` +
      '{id: .id, body: .body, submittedAt: .createdAt}] | first'
    );
  }

  private rateLimitedResult(comment: RateLimitComment): WaitForPrReviewResult {
    const availableAtEpochSeconds = this.parseAvailableAt(comment.body);
    return {
      found: false,
      rateLimited: true,
      rateLimitComment: comment,
      ...(availableAtEpochSeconds === undefined
        ? {}
        : { availableAtEpochSeconds }),
    };
  }

  /**
   * Best-effort only. Splits the body into sentences (and lines), keeps those
   * that mention a wait-time keyword, and takes the first duration found in
   * one of them — scoping it this way keeps an unrelated "3 minutes"
   * elsewhere in the comment from being read as the wait. First match wins;
   * hours convert to minutes. No match means the caller applies its own
   * default.
   */
  private parseAvailableAt(body: string): number | undefined {
    for (const sentence of body.split(/(?<=[.!?])\s+|\n+/)) {
      if (!WAIT_TIME_KEYWORDS.test(sentence)) {
        continue;
      }
      const match = WAIT_TIME_DURATION.exec(sentence);
      if (match === null) {
        continue;
      }
      const minutes =
        match[2].toLowerCase() === 'hour'
          ? Number(match[1]) * 60
          : Number(match[1]);
      return Math.floor(Date.now() / 1000) + minutes * 60;
    }
    return undefined;
  }

  private sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
