import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { ProcessRunnerService } from '../shared/process-runner.service';
import { PullRequestReviewCommentsService } from './pull-request-review-comments.service';
import {
  COMMENT_UPDATE_FAILED_PHRASES,
  NO_ACTIONABLE_COMMENTS_PHRASES,
  RATE_LIMIT_PHRASES,
  STAR_GATE_PHRASES,
  WaitForPrReviewFilterOptions,
  WaitForPrReviewFiltersService,
} from './wait-for-pr-review-filters.service';

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
  /**
   * A comment-update-failure comment already surfaced to the caller —
   * excluded so a re-run does not re-match it forever. Deliberately a
   * separate id from `excludeCommentId`: the two comment kinds are
   * independent GitHub comments with independent ids, and a caller retrying
   * after one kind must not suppress detection of the other.
   */
  readonly excludeCommentUpdateFailureId?: string;
  readonly timeoutMs?: number;
  readonly intervalMs?: number;
  /**
   * When set, one `@coderabbitai review` comment is posted on the first poll
   * at or after this instant, and polling then continues to the deadline. The
   * caller is responsible for passing a `timeoutMs` large enough to cover both
   * the wait until this instant and a normal review window after it — this
   * service only acts once the clock crosses the epoch, it never extends its
   * own deadline for it.
   */
  readonly triggerAfterEpochSeconds?: number;
}

/**
 * A CodeRabbit comment standing in for a review — a rate-limit warning
 * (posted as its own new comment, or edited into the rolling walkthrough
 * comment), or its "couldn't update its existing comment" failure notice.
 * The shape is comment-kind-agnostic, so every kind reuses it.
 */
export interface CodeRabbitComment {
  readonly id: string;
  /**
   * The whole comment body for a new top-level comment, or the extracted
   * bounded section for a rate-limit edit to the rolling comment.
   */
  readonly body: string;
  /**
   * The comment's `createdAt` for a new top-level comment, or the rolling
   * comment's `updated_at` for a rate-limit edit — renamed for symmetry with
   * a review's `submittedAt` either way, and what `parseAvailableAt` anchors
   * its computed wait to.
   */
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
  readonly rateLimitComment?: CodeRabbitComment;
  /**
   * Best-effort epoch parsed from the comment body when it states a relative
   * duration ("available again in 45 minutes", "retry in 2 hours"). Absent
   * when no duration could be parsed — the caller is expected to fall back to
   * a default wait.
   */
  readonly availableAtEpochSeconds?: number;
  /** True only when a qualifying CodeRabbit "couldn't update its existing comment" failure was found instead of a review. */
  readonly commentUpdateFailed?: boolean;
  /** Present only when `commentUpdateFailed` is true. */
  readonly commentUpdateFailedComment?: CodeRabbitComment;
}

/** What one poll saw; all comment/review fields absent means "nothing qualifying yet". */
interface PollOutcome {
  readonly review?: unknown;
  readonly rateLimitComment?: CodeRabbitComment;
  readonly commentUpdateFailedComment?: CodeRabbitComment;
  /**
   * The PR's current head commit, read from the same `gh pr view` call
   * (widened to also request `headRefOid`) — carried through so the
   * rolling-comment check below can cross-check completion freshness against it.
   */
  readonly headRefOid?: string;
  /**
   * A review that matched the jq filter but was discarded as a content-free
   * artifact — empty body, no inline comments (see `checkedReview`). Carried
   * out so `run` can exclude it from later polls in this same wait.
   */
  readonly discardedEmptyReviewId?: string;
  /**
   * A CodeRabbit "does not receive automatic reviews" (star-gate) comment,
   * when found. Never surfaces past `run()`'s own trigger logic — see
   * `starGateFilter`'s doc comment.
   */
  readonly starGateComment?: CodeRabbitComment;
}

/**
 * `WaitForPrReviewOptions` plus the locally-accumulated discard exclusion
 * `run()` layers on top of it. Declared so every internal hop this object
 * takes (`poll`, `pollReviews`, `RollingCommentPollContext.options`) is
 * type-checked to actually carry `excludeReviewIds` through, rather than
 * relying on it surviving as an unchecked excess property — a future
 * refactor that rebuilds this object field-by-field would otherwise drop it
 * silently, with no type error.
 */
type PollOptions = WaitForPrReviewOptions &
  Pick<WaitForPrReviewFilterOptions, 'excludeReviewIds'>;

/**
 * `pollRollingComment`'s inputs bundled into one object: `options` alone plus
 * `headRefOid` would be a 4th positional parameter, over this repo's
 * 3-parameter limit (`local/max-function-params`).
 */
interface RollingCommentPollContext {
  readonly options: PollOptions;
  /** The PR's current head commit; `undefined` when the reviews call could not report it. */
  readonly headRefOid: string | undefined;
}

/**
 * The fields both halves of the rolling-comment filter emit: the comment's
 * id, the `updated_at` that stands in for a review's `submittedAt`, and the
 * bounded section extracted from its body. `section` is kept only long enough
 * for the TypeScript phrase re-check (and, for a rate limit, the composite id
 * and wait-duration parse) — the completion half never lets it reach the
 * caller.
 */
interface SectionCandidate {
  readonly id: string;
  readonly submittedAt: string;
  readonly section: string;
}

/**
 * What the completion half emits: a `SectionCandidate` plus the author the
 * synthesized review is attributed to.
 */
interface CompletionCandidate extends SectionCandidate {
  readonly author: { readonly login: string };
}

/**
 * What one rolling-comment poll found. At most one field is ever set: a
 * rate-limit edit outranks a completion (mirroring `poll()`'s existing
 * hierarchy, where a top-level rate-limit comment already outranks the
 * completion check).
 */
interface RollingCommentOutcome {
  readonly review?: CompletionReview;
  readonly rateLimitComment?: CodeRabbitComment;
}

/**
 * A completed CodeRabbit pass, shaped like a formal review so it can be
 * returned through `WaitForPrReviewResult.review` with no new result field
 * and no caller change. `id` is the composite
 * `"<commentId>@<updatedAtEpochSeconds>"` — opaque to every caller, and
 * round-tripped back as `--exclude-review-id` on the next wait, where an
 * unchanged comment stays excluded while an edited one (advanced
 * `updated_at`, hence a different composite id) reads as a new pass.
 */
interface CompletionReview {
  readonly id: string;
  readonly submittedAt: string;
  readonly author: { readonly login: string };
}

/**
 * Mirrors `RATE_LIMIT_PHRASES` for a second, stricter check in TypeScript
 * (see `hasProsePhrase`/`prosePhraseComment`) — `gh`/jq's own phrase test is a coarse
 * first pass and can be fooled by a phrase appearing only inside markdown
 * code formatting (e.g. a branch name quoted in an inline code span).
 */
const RATE_LIMIT_PHRASE_REGEX = new RegExp(RATE_LIMIT_PHRASES, 'i');
/** Mirrors `COMMENT_UPDATE_FAILED_PHRASES` for the stricter TypeScript re-check. */
const COMMENT_UPDATE_FAILED_PHRASE_REGEX = new RegExp(
  COMMENT_UPDATE_FAILED_PHRASES,
  'i',
);
/** Mirrors `STAR_GATE_PHRASES` for the stricter TypeScript re-check. */
const STAR_GATE_PHRASE_REGEX = new RegExp(STAR_GATE_PHRASES, 'i');
/** A fenced code block: three backticks, any content, three backticks. */
const FENCED_CODE_BLOCK = /```[\s\S]*?```/g;
/** An inline code span: a backtick, no-backtick content, a backtick. */
const INLINE_CODE_SPAN = /`[^`]*`/g;

/** Mirrors `NO_ACTIONABLE_COMMENTS_PHRASES` for the stricter TypeScript re-check. */
const NO_ACTIONABLE_COMMENTS_PHRASE_REGEX = new RegExp(
  NO_ACTIONABLE_COMMENTS_PHRASES,
  'i',
);
/**
 * How much of the section's SHA-1 digest goes into its composite id. Not a
 * security boundary — this only has to distinguish one rendering of the
 * warning block from another, so a short prefix keeps the id readable in the
 * `--exclude-comment-id` value callers round-trip.
 */
const SECTION_FINGERPRINT_LENGTH = 12;

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
 * parsed — see `parseAvailableAt`.
 */
const RATE_LIMIT_WAIT_BUFFER_SECONDS = 60;

/** 10 minutes — how long to wait for a review when the caller sets no timeout. */
const DEFAULT_TIMEOUT_MS = 600_000;
/** 30 seconds — the gap between review-status polls when the caller sets none. */
const DEFAULT_INTERVAL_MS = 30_000;
/**
 * 10 seconds — the pause given to CodeRabbit to notice the trigger comment
 * and begin processing it, used in place of `intervalMs` on the one iteration
 * that just posted the trigger. It only has to cover the gap between the
 * comment landing and CodeRabbit reacting to it, not a whole review window,
 * so it is typically much shorter than a normal interval — but it is a fixed
 * pause, not clamped against `intervalMs`, so a caller-supplied interval
 * under 10 seconds would see the opposite. No caller passes one today: both
 * develop-feature's normal wait and its retrigger flows use intervals of 30
 * seconds or more. Distinct from `RATE_LIMIT_WAIT_BUFFER_SECONDS`, which pads
 * CodeRabbit's own stated rate-limit duration so the retry does not fire
 * before that wait is over.
 */
const TRIGGER_SETTLE_MS = 10_000;

/** What a triggered review is asked for with; CodeRabbit's own command. */
const TRIGGER_REVIEW_BODY = '@coderabbitai review';

/**
 * Waits until someone other than the PR's author submits a review, or until
 * a timeout elapses. Exists as a single-command CLI subcommand because a
 * worktree-isolated session refuses to run a multi-line shell poll loop.
 * Silent while polling: the only output is the final JSON result `main.ts`
 * prints.
 *
 * Bot-agnostic by construction — it looks for *some* formal review object
 * from a non-author, never for a particular bot's name.
 *
 * Four exceptions are CodeRabbit-specific, because all four are
 * CodeRabbit's own behaviour rather than anything GitHub models as a review.
 * It answers its per-developer review rate limit either with a top-level PR
 * comment or by editing that same rolling comment in place, so both shapes
 * are looked for; it can finish a pass with nothing actionable to say and
 * report *that* only by editing its rolling walkthrough comment in place;
 * it can fail to persist such an edit at all, posting a "couldn't update
 * its existing comment" notice instead while the rolling comment stays
 * stuck mid-pass; and, on a repo with too few stars, it posts a one-time
 * notice that automatic reviews are disabled entirely — all three comment
 * cases observed in practice. Each poll therefore also looks for those
 * comments — narrowly, by CodeRabbit's own login and wording — and returns
 * (or, for the star-gate notice, triggers a manual review and continues)
 * as soon as it finds one, rather than running out the whole timeout with
 * nothing to report. A completion comment comes back shaped like a review,
 * so callers need no new result field: see `CompletionReview`. The
 * rate-limit and comment-update-failure cases come back as their own result
 * fields. The star-gate case never reaches a caller as its own field: it is
 * handled entirely inside `run()`, which posts the same `@coderabbitai
 * review` trigger a caller-requested retrigger would (see `shouldTrigger`).
 */
@Injectable()
export class WaitForPrReviewService {
  constructor(
    private readonly processRunner: ProcessRunnerService,
    private readonly filters: WaitForPrReviewFiltersService,
    private readonly reviewComments: PullRequestReviewCommentsService,
  ) {}

  async run(options: WaitForPrReviewOptions): Promise<WaitForPrReviewResult> {
    const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    let triggered = false;
    /**
     * Ids of empty-artifact reviews this wait has discarded so far (see
     * `checkedReview`), accumulated — never replacing — across polls. Needed
     * because `reviewFilter`'s jq always yields the chronologically *first*
     * matching review: without excluding every discard, the same artifact
     * would be re-matched and re-discarded on every later poll, hiding any
     * genuine review that arrives after it.
     *
     * Deliberately layered on top of `options.excludeReviewId` via a
     * SEPARATE `excludeReviewIds` field, rather than overwriting
     * `excludeReviewId` itself: the caller's own `excludeReviewId` — e.g.
     * develop-feature's watermark exclusion for a review it already handled
     * in a previous iteration — must survive untouched for this wait's whole
     * lifetime, or that already-handled review could match again once a
     * later discard overwrote the exclusion that was suppressing it.
     */
    const discardedReviewIds: string[] = [];
    for (;;) {
      const pollOptions =
        discardedReviewIds.length === 0
          ? options
          : { ...options, excludeReviewIds: discardedReviewIds.slice() };
      const outcome = await this.poll(pollOptions, deadline, intervalMs);
      if (outcome?.review !== undefined) {
        return { found: true, review: outcome.review };
      }
      if (
        outcome?.discardedEmptyReviewId !== undefined &&
        !discardedReviewIds.includes(outcome.discardedEmptyReviewId)
      ) {
        discardedReviewIds.push(outcome.discardedEmptyReviewId);
      }
      // Checked here — after a formal review has ruled itself out, but
      // before the rate-limit/comment-update-failure early returns below —
      // so a caller-requested retrigger (develop-feature's Phase 6 steps
      // b2/b3) fires once due regardless of what else this same poll
      // matched. A found review needs no retrigger — that outcome is
      // already the wait's success case — so it returns above without ever
      // reaching this check.
      /**
       * Whether the trigger comment was posted on *this* iteration — distinct
       * from `triggered`, which latches for the whole `run()` so the comment
       * is only ever posted once. `outcome` was fetched before the comment
       * existed, so this iteration's rate-limit / comment-update-failure
       * matches (including a stale, still-unexcluded one, e.g. a second
       * failure notice from before this wait's own watermark) are pre-trigger
       * data: returning them would end the wait with the very answer the
       * trigger was posted to move past, with no fresh poll ever happening
       * to check. Suppression lasts exactly this one
       * iteration — the next poll's findings are treated like any other
       * iteration's, and nothing here excludes the suppressed comment by id,
       * so an unchanged one is simply re-matched and reported normally next
       * time.
       */
      let justTriggered = false;
      // Two independent reasons to trigger: the caller asked for one at a
      // known instant (`shouldTrigger`), or this poll itself just found the
      // star-gate comment — automatic reviews are disabled for the whole
      // repo, so there is nothing to wait out and no reason to hold off
      // until the caller's own retry logic notices. `outcome.starGateComment`
      // needs no exclusion id the way rate-limit/comment-update-failure do:
      // `triggered` already prevents a second trigger within this `run()`
      // call, and the comment predates any watermark a later wait derives
      // from an actual review.
      if (
        !triggered &&
        (this.shouldTrigger(options) || outcome?.starGateComment !== undefined)
      ) {
        // Set before awaiting: a slow or failing post must not be retried on
        // every interval for the rest of the wait.
        triggered = true;
        justTriggered = true;
        await this.triggerReview(
          options.prNumber,
          this.budgetMs(deadline, intervalMs),
        );
      }
      if (!justTriggered) {
        if (outcome?.rateLimitComment !== undefined) {
          return this.rateLimitedResult(outcome.rateLimitComment);
        }
        if (outcome?.commentUpdateFailedComment !== undefined) {
          return this.commentUpdateFailedResult(
            outcome.commentUpdateFailedComment,
          );
        }
      }
      if (Date.now() >= deadline) {
        return { found: false, timedOut: true };
      }
      // Replaces this iteration's normal sleep rather than adding to it —
      // exactly one sleep still happens per iteration. Both deadline checks
      // around it apply unchanged either way: if fewer than TRIGGER_SETTLE_MS
      // remain when a result was just suppressed above, waking past the
      // deadline reports `timedOut` rather than the suppressed comment. Every
      // caller today budgets at least a 10-minute window after a trigger, so
      // this cannot happen in practice — see develop-feature Phase 6 steps
      // b2/b3's `--timeout-ms` computation.
      await this.sleep(justTriggered ? TRIGGER_SETTLE_MS : intervalMs);
      // `sleep` can resume at or after the deadline (real-timer drift, a
      // slow event loop) even though the check above passed just before it
      // started — re-check here so a late wake-up cannot trigger one more
      // `gh` call, and possibly return a review that arrived after the
      // caller's own timeout had already elapsed.
      if (Date.now() >= deadline) {
        return { found: false, timedOut: true };
      }
    }
  }

  /**
   * One poll: at most three `gh` calls, each bounded to the time left before
   * `deadline`. Bounding every call this way guarantees a result can never
   * arrive long after `deadline` and be mistaken for a fresh `found`.
   *
   * The second call is made only when the first found nothing. That keeps
   * the existing precedence intact — a formal review is the strongest
   * signal, and within the second call a rate-limit edit outranks a
   * completion (see `RollingCommentOutcome`) — and keeps a failing `gh` from
   * doubling its own cost. A third call is made only when the first found an
   * empty-bodied review candidate that needs verifying (see `checkedReview`).
   */
  private async poll(
    options: PollOptions,
    deadline: number,
    intervalMs: number,
  ): Promise<PollOutcome | undefined> {
    const outcome = await this.pollReviews(options, deadline, intervalMs);
    if (outcome === undefined) {
      return undefined;
    }
    if (
      outcome.review !== undefined ||
      outcome.rateLimitComment !== undefined ||
      outcome.commentUpdateFailedComment !== undefined ||
      outcome.starGateComment !== undefined
    ) {
      return outcome;
    }
    const rolling = await this.pollRollingComment(
      { options, headRefOid: outcome.headRefOid },
      deadline,
      intervalMs,
    );
    // Carry the reviews half's discarded-artifact id through even though the
    // rolling-comment check found nothing of its own — otherwise `run` would
    // never learn to exclude it, and the same artifact review would be
    // re-matched and re-discarded on every later poll (see `run`).
    return {
      ...(rolling ?? {}),
      ...(outcome.discardedEmptyReviewId === undefined
        ? {}
        : { discardedEmptyReviewId: outcome.discardedEmptyReviewId }),
    };
  }

  /**
   * The formal-review and rate-limit halves, in one `gh` call.
   *
   * Returns `undefined` when the call failed or did not finish before its
   * own bound — a transient or stalled `gh` call is a reason to retry on the
   * next interval, never to abort the wait.
   */
  private async pollReviews(
    options: PollOptions,
    deadline: number,
    intervalMs: number,
  ): Promise<PollOutcome | undefined> {
    const result = await this.processRunner.run(
      'gh',
      [
        'pr',
        'view',
        options.prNumber,
        '--json',
        // headRefOid is requested here — not in a separate `gh` call — so
        // the completion-comment check below can cross-check freshness
        // against the PR's *current* head commit at no extra cost.
        'reviews,comments,headRefOid',
        '--jq',
        this.filters.reviewsCall(options),
      ],
      this.budgetMs(deadline, intervalMs),
    );
    if (result.exitCode !== 0) {
      return undefined;
    }
    const parsed = this.parseJsonObject(result.stdout) as
      PollOutcome | undefined;
    if (parsed === undefined) {
      return undefined;
    }
    // jq emits `null` for an empty half; normalise each to `undefined` so
    // callers can test them with a single `!== undefined`. Both comment
    // candidates are re-checked here — see `prosePhraseComment`.
    const rateLimitComment = this.prosePhraseComment(
      parsed.rateLimitComment,
      RATE_LIMIT_PHRASE_REGEX,
    );
    const commentUpdateFailedComment = this.prosePhraseComment(
      parsed.commentUpdateFailedComment,
      COMMENT_UPDATE_FAILED_PHRASE_REGEX,
    );
    const starGateComment = this.prosePhraseComment(
      parsed.starGateComment,
      STAR_GATE_PHRASE_REGEX,
    );
    const headRefOid =
      typeof parsed.headRefOid === 'string' ? parsed.headRefOid : undefined;
    const checked = await this.checkedReview(
      parsed.review,
      this.budgetMs(deadline, intervalMs),
    );
    return {
      ...checked,
      ...(rateLimitComment === undefined ? {} : { rateLimitComment }),
      ...(commentUpdateFailedComment === undefined
        ? {}
        : { commentUpdateFailedComment }),
      ...(starGateComment === undefined ? {} : { starGateComment }),
      ...(headRefOid === undefined ? {} : { headRefOid }),
    };
  }

  /**
   * A matched review, or the id of one discarded as a content-free artifact.
   *
   * CodeRabbit can submit a formally valid review carrying nothing at all —
   * empty body, no inline comments — while its actual pass was blocked by the
   * developer's review rate limit. The jq filter cannot tell that apart from
   * a real review, so an empty-bodied candidate is verified with one extra
   * lookup before it is trusted.
   *
   * Fails closed, matching `coversHeadCommit`'s precedent: a lookup that could
   * not answer (`undefined`) discards the candidate rather than trusting an
   * unverifiable one. A false timeout costs one wasted wait; a false `found`
   * makes the caller act as if the code had been reviewed when it never was.
   */
  private async checkedReview(
    candidate: unknown,
    timeoutMs: number,
  ): Promise<{ review?: unknown; discardedEmptyReviewId?: string }> {
    if (candidate == null) {
      return {};
    }
    const reviewId = this.emptyBodyReviewId(candidate);
    if (reviewId === undefined) {
      return { review: candidate };
    }
    const hasComments = await this.reviewComments.hasInlineComments(
      reviewId,
      timeoutMs,
    );
    return hasComments === true
      ? { review: candidate }
      : { discardedEmptyReviewId: reviewId };
  }

  /**
   * The candidate's id when it needs verifying — i.e. it is an object with a
   * string id and a missing, null, empty, or whitespace-only `body`.
   * `undefined` means "trust it as-is": either the body carries real summary
   * text (the common case, verified at zero extra cost), or the shape is not
   * one this check can reason about.
   *
   * A candidate without a string `id` is deliberately trusted rather than
   * discarded: it cannot be looked up *and* cannot be excluded from the next
   * poll, so discarding it would loop forever on the same value. jq only ever
   * emits real GitHub review objects here, so this is a defensive branch, not
   * a live path.
   */
  private emptyBodyReviewId(candidate: unknown): string | undefined {
    if (typeof candidate !== 'object' || candidate === null) {
      return undefined;
    }
    const { id, body } = candidate as { id?: unknown; body?: unknown };
    if (typeof id !== 'string') {
      return undefined;
    }
    return typeof body === 'string' && body.trim() !== '' ? undefined : id;
  }

  /**
   * CodeRabbit has two outcomes it reports only by editing its rolling
   * walkthrough comment in place, with no formal review object ever
   * submitted: a pass that finished with nothing actionable, and a
   * re-review it refused because the developer hit their review rate limit.
   * Detecting either needs the comment's `updated_at`, which
   * `gh pr view --json comments` does not expose (it carries `createdAt`
   * only, and the comment is created on the *first* pass), so this reads the
   * issue-comments REST endpoint instead — one call, one jq program, both
   * signals, so this part of the poll costs exactly one `gh` call (a poll's
   * overall total can still reach three — see `poll`'s doc comment).
   *
   * Returns `undefined` for a failed call, unparseable output, or no
   * qualifying candidate of either kind.
   */
  private async pollRollingComment(
    context: RollingCommentPollContext,
    deadline: number,
    intervalMs: number,
  ): Promise<RollingCommentOutcome | undefined> {
    const { options, headRefOid } = context;
    const result = await this.processRunner.run(
      'gh',
      [
        'api',
        this.filters.commentsPath(options),
        '--jq',
        this.filters.rollingComment(options),
      ],
      this.budgetMs(deadline, intervalMs),
    );
    if (result.exitCode !== 0) {
      return undefined;
    }
    const parsed = this.parseJsonObject(result.stdout);
    if (parsed === undefined) {
      return undefined;
    }
    const rateLimitComment = this.rateLimitEditComment(
      this.parseSectionCandidate(parsed.rateLimitEdit),
      options.excludeCommentId,
    );
    if (rateLimitComment !== undefined) {
      return { rateLimitComment };
    }
    const review = this.completionReview(parsed.completion, headRefOid);
    return review === undefined ? undefined : { review };
  }

  /**
   * A rate-limit edit, kept only if its section really says so in prose (jq's
   * phrase test is a coarse first pass — see `hasProsePhrase`) and it is not
   * the very signal the caller already surfaced.
   *
   * The composite id hashes the section's own *content*, not its
   * `updated_at` as the completion half does. GitHub gives one `updated_at`
   * for the whole rolling comment, so an unrelated later edit (refreshing the
   * commits list, say) advances it while a stale rate-limit block sits
   * unchanged underneath; an `updated_at`-based id would read that as a brand
   * new rate limit forever. A content hash keeps the id stable for as long as
   * the block's text is, so `excludeCommentId` suppresses it correctly, while
   * a genuinely new block (a fresh wait duration, a different reviewed file
   * list) hashes differently and reads as fresh.
   *
   * Cost of that choice: a byte-identical *repeat* rate-limit block is
   * silently unreportable. If CodeRabbit re-emits a block whose content
   * exactly matches one the caller already excluded (same quota wording, same
   * file list, same SHAs), the hash — and so the id — is unchanged, and this
   * method returns `undefined` even though the caller has no way to know the
   * repeat happened. The caller then just runs out its timeout instead of
   * getting a second rate-limit report. This is the correct side of the
   * tradeoff (a false timeout is far better than the original bug this
   * method exists to fix — a stale block read as fresh forever), so it is
   * accepted deliberately, not a defect to fix.
   */
  private rateLimitEditComment(
    candidate: SectionCandidate | undefined,
    excludeCommentId: string | undefined,
  ): CodeRabbitComment | undefined {
    if (
      candidate === undefined ||
      !this.hasProsePhrase(candidate.section, RATE_LIMIT_PHRASE_REGEX)
    ) {
      return undefined;
    }
    const fingerprint = createHash('sha1')
      .update(candidate.section)
      .digest('hex')
      .slice(0, SECTION_FINGERPRINT_LENGTH);
    const id = `${candidate.id}@${fingerprint}`;
    return id === excludeCommentId
      ? undefined
      : { id, body: candidate.section, submittedAt: candidate.submittedAt };
  }

  /**
   * The completion half's candidate, kept only if its section really says
   * "nothing to report" in prose and covers the PR's current head commit (see
   * `coversHeadCommit`). Shaped like a formal review so it needs no new
   * result field.
   */
  private completionReview(
    value: unknown,
    headRefOid: string | undefined,
  ): CompletionReview | undefined {
    const candidate = this.parseCompletionCandidate(value);
    if (
      candidate === undefined ||
      !this.hasProsePhrase(
        candidate.section,
        NO_ACTIONABLE_COMMENTS_PHRASE_REGEX,
      ) ||
      !this.coversHeadCommit(candidate, headRefOid)
    ) {
      return undefined;
    }
    return {
      id: candidate.id,
      submittedAt: candidate.submittedAt,
      author: { login: candidate.author.login },
    };
  }

  /**
   * Validates every field either half of the rolling-comment filter is
   * supposed to have produced. A filter that ever emits something unexpected
   * — or a `null` half, which is what `[] | first` yields for no match — must
   * read as "no match" rather than as a half-built signal.
   */
  private parseSectionCandidate(value: unknown): SectionCandidate | undefined {
    if (value === null || typeof value !== 'object') {
      return undefined;
    }
    const { id, submittedAt, section } = value as {
      id?: unknown;
      submittedAt?: unknown;
      section?: unknown;
    };
    return typeof id === 'string' &&
      typeof submittedAt === 'string' &&
      typeof section === 'string'
      ? { id, submittedAt, section }
      : undefined;
  }

  /** The same validation plus the author the synthesized review needs. */
  private parseCompletionCandidate(
    value: unknown,
  ): CompletionCandidate | undefined {
    const base = this.parseSectionCandidate(value);
    if (base === undefined) {
      return undefined;
    }
    const author = (value as { author?: { login?: unknown } }).author;
    const login =
      typeof author === 'object' && author !== null ? author.login : undefined;
    return typeof login === 'string'
      ? { ...base, author: { login } }
      : undefined;
  }

  /**
   * GitHub gives one `updated_at` for CodeRabbit's whole rolling walkthrough
   * comment. If CodeRabbit edits *any* part of it — e.g. refreshing the
   * walkthrough/commits list while a new review pass is still running —
   * `updated_at` advances even though the `recent_review` section still
   * describes the *previous*, already-stale pass. Without this check, that
   * edit could be misread as a fresh "nothing to report" signal for commits
   * CodeRabbit has not actually reviewed yet.
   *
   * Real CodeRabbit output states the reviewed commit range in prose
   * ("Reviewing files that changed from the base of the PR and between
   * `<base>` and `<head>`"), but that wording is not guaranteed stable.
   * Requiring the PR's full 40-char head SHA to appear verbatim in the
   * section is a much more robust freshness signal than parsing that
   * sentence's structure. An unknown `headRefOid` (the reviews call could
   * not report it) fails closed rather than trust an unverifiable candidate.
   */
  private coversHeadCommit(
    candidate: CompletionCandidate,
    headRefOid: string | undefined,
  ): boolean {
    return headRefOid !== undefined && candidate.section.includes(headRefOid);
  }

  /**
   * One JSON object out of a `gh --jq` result. `undefined` for empty output,
   * a jq `null` (what `[] | first` yields for no match), unparseable text,
   * or any non-object — none of which is a reason to abort the wait.
   */
  private parseJsonObject(stdout: string): Record<string, unknown> | undefined {
    const trimmed = stdout.trim();
    if (trimmed === '' || trimmed === 'null') {
      return undefined;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return undefined;
    }
    return parsed !== null && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : undefined;
  }

  /**
   * Strips fenced code blocks and inline code spans before testing for a
   * phrase — both the rate-limit warning and the completion notice are
   * prose, not code, so this narrows matching without weakening real
   * detection. Without this, a status comment that echoes a branch name
   * containing "rate-limit" inside an inline code span would false-positive.
   */
  private hasProsePhrase(text: string, phrase: RegExp): boolean {
    const prose = text
      .replace(FENCED_CODE_BLOCK, '')
      .replace(INLINE_CODE_SPAN, '');
    return phrase.test(prose);
  }

  /**
   * One comment-shaped candidate out of the reviews call, kept only if it
   * survives the stricter TypeScript phrase re-check. jq's own phrase test is
   * a coarse first pass and can be fooled by a phrase appearing only inside
   * markdown code formatting; the `typeof` guards on every field additionally
   * make a malformed jq response read as "no match" rather than crash the
   * wait (the reviews half's shape is asserted by a cast, not checked). All
   * three fields are validated, not just `body`: a caller retrying off a
   * candidate missing `id` or `submittedAt` (develop-feature's Phase 6 steps
   * b2/b3) would build an unusable exclusion value or watermark.
   */
  private prosePhraseComment(
    candidate: unknown,
    phrase: RegExp,
  ): CodeRabbitComment | undefined {
    if (candidate === null || typeof candidate !== 'object') {
      return undefined;
    }
    const comment = candidate as Partial<CodeRabbitComment>;
    return typeof comment.id === 'string' &&
      typeof comment.body === 'string' &&
      typeof comment.submittedAt === 'string' &&
      this.hasProsePhrase(comment.body, phrase)
      ? { id: comment.id, body: comment.body, submittedAt: comment.submittedAt }
      : undefined;
  }

  private shouldTrigger(options: WaitForPrReviewOptions): boolean {
    return (
      options.triggerAfterEpochSeconds !== undefined &&
      Date.now() >= options.triggerAfterEpochSeconds * 1000
    );
  }

  /**
   * Failure is deliberately swallowed: a trigger that could not be posted is
   * no reason to abort a wait that may still see a review, and the caller
   * learns the outcome from the wait's own result either way.
   */
  private async triggerReview(
    prNumber: string,
    timeoutMs: number,
  ): Promise<void> {
    try {
      await this.processRunner.run(
        'gh',
        ['pr', 'comment', prNumber, '--body', TRIGGER_REVIEW_BODY],
        timeoutMs,
      );
    } catch {
      // Nothing to do — see above.
    }
  }

  /**
   * The time left before `deadline`, or one interval once that budget is
   * exhausted. `ProcessRunnerService` treats a zero/negative bound as "kill
   * almost immediately", so an exhausted budget passed through as-is would
   * deny the call any real chance to complete.
   */
  private budgetMs(deadline: number, intervalMs: number): number {
    const remainingMs = deadline - Date.now();
    return remainingMs > 0 ? remainingMs : intervalMs;
  }

  private rateLimitedResult(comment: CodeRabbitComment): WaitForPrReviewResult {
    const availableAtEpochSeconds = this.parseAvailableAt(comment);
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
   * No `availableAtEpochSeconds` equivalent: unlike the rate-limit comment,
   * CodeRabbit's text for this failure states no wait duration, so the caller
   * falls back to an immediate retry.
   */
  private commentUpdateFailedResult(
    comment: CodeRabbitComment,
  ): WaitForPrReviewResult {
    return {
      found: false,
      commentUpdateFailed: true,
      commentUpdateFailedComment: comment,
    };
  }

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
  private parseAvailableAt(comment: CodeRabbitComment): number | undefined {
    for (const sentence of comment.body.split(/(?<=[.!?])\s+|\n+/)) {
      if (!WAIT_TIME_KEYWORDS.test(sentence)) continue;
      const match = WAIT_TIME_DURATION.exec(sentence);
      if (match === null) continue;
      const minutes =
        match[2].toLowerCase() === 'hour'
          ? Number(match[1]) * 60
          : Number(match[1]);
      return (
        Math.floor(new Date(comment.submittedAt).getTime() / 1000) +
        minutes * 60 +
        RATE_LIMIT_WAIT_BUFFER_SECONDS
      );
    }
    return undefined;
  }

  private sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
