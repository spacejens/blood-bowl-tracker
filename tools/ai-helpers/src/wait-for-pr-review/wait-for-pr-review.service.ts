import { createHash } from 'node:crypto';

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
}

/**
 * `pollRollingComment`'s inputs bundled into one object: `options` alone plus
 * `headRefOid` would be a 4th positional parameter, over this repo's
 * 3-parameter limit (`local/max-function-params`).
 */
interface RollingCommentPollContext {
  readonly options: WaitForPrReviewOptions;
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
 * Tolerant, deliberately CodeRabbit-specific wording match. The exact
 * rate-limit comment text is unknown and may drift, so any one of these
 * phrases (case-insensitive) qualifies.
 */
const RATE_LIMIT_PHRASES = 'rate limit|rate-limit|review limit|usage limit';
/**
 * Mirrors `RATE_LIMIT_PHRASES` for a second, stricter check in TypeScript
 * (see `hasProsePhrase`/`prosePhraseComment`) — `gh`/jq's own phrase test is a coarse
 * first pass and can be fooled by a phrase appearing only inside markdown
 * code formatting (e.g. a branch name quoted in an inline code span).
 */
const RATE_LIMIT_PHRASE_REGEX = new RegExp(RATE_LIMIT_PHRASES, 'i');
/**
 * Tolerant, deliberately CodeRabbit-specific wording for its third
 * non-review outcome: it failed to persist an edit to its rolling
 * walkthrough comment and posted a separate top-level notice instead
 * (observed on PR #408: "CodeRabbit couldn't update its existing comment.
 * The review summary may be out of date. Error details: putComment timed
 * out."). Same tolerance rationale as `RATE_LIMIT_PHRASES` — the exact text
 * is CodeRabbit's own and may drift, so any one of these phrases
 * (case-insensitive) qualifies. The character class accepts both a straight
 * and a typographic apostrophe.
 */
const COMMENT_UPDATE_FAILED_PHRASES =
  "couldn['’]t update its existing comment|" +
  'could not update its existing comment|' +
  "can['’]t update its existing comment|" +
  'cannot update its existing comment';
/** Mirrors `COMMENT_UPDATE_FAILED_PHRASES` for the stricter TypeScript re-check. */
const COMMENT_UPDATE_FAILED_PHRASE_REGEX = new RegExp(
  COMMENT_UPDATE_FAILED_PHRASES,
  'i',
);
/** A fenced code block: three backticks, any content, three backticks. */
const FENCED_CODE_BLOCK = /```[\s\S]*?```/g;
/** An inline code span: a backtick, no-backtick content, a backtick. */
const INLINE_CODE_SPAN = /`[^`]*`/g;

/** Opens the "most recent review" section of CodeRabbit's rolling walkthrough comment. */
const RECENT_REVIEW_START_MARKER = '<!-- recent_review_start -->';
/** Closes it. Both markers must be present for the section to be extractable. */
const RECENT_REVIEW_END_MARKER = '<!-- recent_review_end -->';
/**
 * jq/Oniguruma pattern capturing the bounded section. `[\s\S]` rather than
 * `.` with a dot-matches-newline flag: jq rejects the `"s"` flag outright,
 * and the section always spans many lines. Non-greedy so a body carrying
 * several marker pairs cannot swallow everything between the first start and
 * the last end.
 */
const RECENT_REVIEW_SECTION_PATTERN = `${RECENT_REVIEW_START_MARKER}(?<section>[\\s\\S]*?)${RECENT_REVIEW_END_MARKER}`;
/**
 * Tolerant, deliberately CodeRabbit-specific wording match for "this pass
 * finished with nothing to report" — same rationale as
 * `RATE_LIMIT_PHRASES`: the exact text is CodeRabbit's own and may drift, so
 * any one of these phrases (case-insensitive) qualifies. Tested against the
 * extracted section only, never the whole (very large) walkthrough body.
 */
const NO_ACTIONABLE_COMMENTS_PHRASES =
  'no actionable comments|no actionable issues|nothing to report|no comments were generated';
/** Mirrors `NO_ACTIONABLE_COMMENTS_PHRASES` for the stricter TypeScript re-check. */
const NO_ACTIONABLE_COMMENTS_PHRASE_REGEX = new RegExp(
  NO_ACTIONABLE_COMMENTS_PHRASES,
  'i',
);
/**
 * Opens the block CodeRabbit edits into its *existing* rolling walkthrough
 * comment when it rate-limits a re-review — no new comment is posted, and the
 * comment's `createdAt` never moves, which is exactly why `rateLimitFilter`
 * (which reads `gh pr view --json comments`, a payload with no `updated_at`)
 * cannot see it. Observed on PR #464.
 */
const RATE_LIMIT_EDIT_START_MARKER =
  '<!-- This is an auto-generated comment: rate limited by coderabbit.ai -->';
/**
 * Closes it. Both markers must be present for the section to be extractable —
 * same paired-marker discipline as the completion section above, and for the
 * same reason: the phrase test and the wait-duration parse must see the
 * warning block only, never the whole (very large) walkthrough body.
 */
const RATE_LIMIT_EDIT_END_MARKER =
  '<!-- end of auto-generated comment: rate limited by coderabbit.ai -->';
/** Same `[\s\S]`/non-greedy rationale as `RECENT_REVIEW_SECTION_PATTERN`. */
const RATE_LIMIT_EDIT_SECTION_PATTERN = `${RATE_LIMIT_EDIT_START_MARKER}(?<section>[\\s\\S]*?)${RATE_LIMIT_EDIT_END_MARKER}`;
/**
 * How much of the section's SHA-1 digest goes into its composite id. Not a
 * security boundary — this only has to distinguish one rendering of the
 * warning block from another, so a short prefix keeps the id readable in the
 * `--exclude-comment-id` value callers round-trip.
 */
const SECTION_FINGERPRINT_LENGTH = 12;
/** Bounds the unpaginated comments request; far more than one pass can edit. */
const COMMENTS_PER_PAGE = 100;

/** A sentence must mention one of these to be read as stating a wait time. */
const WAIT_TIME_KEYWORDS = /\b(again|retry|available|resets|wait|before)\b/i;
/** The duration itself: a number followed by a minute/hour unit. */
const WAIT_TIME_DURATION = /(\d+)\s*(minute|hour)s?\b/i;

/** 10 minutes — matches develop-feature Phase 6's original wait. */
const DEFAULT_TIMEOUT_MS = 600_000;
/** 30 seconds — matches develop-feature Phase 6's original poll interval. */
const DEFAULT_INTERVAL_MS = 30_000;

/** What a triggered review is asked for with; CodeRabbit's own command. */
const TRIGGER_REVIEW_BODY = '@coderabbitai review';

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
 * Three exceptions are CodeRabbit-specific, because all three are
 * CodeRabbit's own behaviour rather than anything GitHub models as a review.
 * It answers its per-developer review rate limit either with a top-level PR
 * comment or by editing that same rolling comment in place (issue #465, seen
 * on PR #464), so both shapes are looked for;
 * it can finish a pass with nothing actionable to say and report *that* only
 * by editing its rolling walkthrough comment in place; and it can fail to
 * persist such an edit at all, posting a "couldn't update its existing
 * comment" notice instead while the rolling comment stays stuck mid-pass
 * (observed on PR #408). Each poll therefore also looks for those comments —
 * narrowly, by CodeRabbit's own login and wording — and returns as soon as it
 * finds one, rather than running out the whole timeout with nothing to
 * report. A completion comment comes back shaped like a review, so callers
 * need no new result field: see `CompletionReview`. The other two come back
 * as their own result fields.
 */
@Injectable()
export class WaitForPrReviewService {
  constructor(private readonly processRunner: ProcessRunnerService) {}

  async run(options: WaitForPrReviewOptions): Promise<WaitForPrReviewResult> {
    const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    let triggered = false;
    for (;;) {
      const outcome = await this.poll(options, deadline, intervalMs);
      if (outcome?.review !== undefined) {
        return { found: true, review: outcome.review };
      }
      // Checked here — after a formal review has ruled itself out, but
      // before the rate-limit/comment-update-failure early returns below —
      // so a stale, still-unexcluded comment of either kind (e.g. a second
      // failure notice from before this wait's own watermark) cannot make
      // this iteration return early without the trigger ever firing. A
      // caller-requested retrigger (develop-feature's Phase 6 steps b2/b3)
      // must fire once due, regardless of what else this same poll matched.
      // A found review needs no retrigger — that outcome is already the
      // wait's success case — so it is excluded from this reasoning and
      // returns above without ever reaching this check.
      if (!triggered && this.shouldTrigger(options)) {
        // Set before awaiting: a slow or failing post must not be retried on
        // every interval for the rest of the wait.
        triggered = true;
        await this.triggerReview(
          options.prNumber,
          this.budgetMs(deadline, intervalMs),
        );
      }
      if (outcome?.rateLimitComment !== undefined) {
        return this.rateLimitedResult(outcome.rateLimitComment);
      }
      if (outcome?.commentUpdateFailedComment !== undefined) {
        return this.commentUpdateFailedResult(
          outcome.commentUpdateFailedComment,
        );
      }
      if (Date.now() >= deadline) {
        return { found: false, timedOut: true };
      }
      await this.sleep(intervalMs);
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
   * One poll: at most two `gh` calls, each bounded to the time left before
   * `deadline`. Bounding every call this way guarantees a result can never
   * arrive long after `deadline` and be mistaken for a fresh `found`.
   *
   * The second call is made only when the first found nothing. That keeps
   * the existing precedence intact — a formal review is the strongest
   * signal, and within the second call a rate-limit edit outranks a
   * completion (see `RollingCommentOutcome`) — and keeps a failing `gh` from
   * doubling its own cost.
   */
  private async poll(
    options: WaitForPrReviewOptions,
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
      outcome.commentUpdateFailedComment !== undefined
    ) {
      return outcome;
    }
    const rolling = await this.pollRollingComment(
      { options, headRefOid: outcome.headRefOid },
      deadline,
      intervalMs,
    );
    return rolling ?? {};
  }

  /**
   * The formal-review and rate-limit halves, in one `gh` call.
   *
   * Returns `undefined` when the call failed or did not finish before its
   * own bound — a transient or stalled `gh` call is a reason to retry on the
   * next interval, never to abort the wait.
   */
  private async pollReviews(
    options: WaitForPrReviewOptions,
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
        this.filter(options),
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
    const headRefOid =
      typeof parsed.headRefOid === 'string' ? parsed.headRefOid : undefined;
    return {
      ...(parsed.review == null ? {} : { review: parsed.review }),
      ...(rateLimitComment === undefined ? {} : { rateLimitComment }),
      ...(commentUpdateFailedComment === undefined
        ? {}
        : { commentUpdateFailedComment }),
      ...(headRefOid === undefined ? {} : { headRefOid }),
    };
  }

  /**
   * CodeRabbit has two outcomes it reports only by editing its rolling
   * walkthrough comment in place, with no formal review object ever
   * submitted: a pass that finished with nothing actionable, and a re-review
   * it refused because the developer hit their review rate limit (issue
   * #465). Detecting either needs the comment's `updated_at`, which
   * `gh pr view --json comments` does not expose (it carries `createdAt`
   * only, and the comment is created on the *first* pass), so this reads the
   * issue-comments REST endpoint instead — one call, one jq program, both
   * signals, keeping a poll at two `gh` calls.
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
        this.commentsPath(options),
        '--jq',
        this.rollingCommentFilter(options),
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
   * detection. (Real false positive from PR #399: CodeRabbit's status
   * comment echoed a branch name containing "rate-limit" in an inline code
   * span.)
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

  /**
   * One object per poll, holding both halves of the query. Each half is
   * wrapped in `[...] | first` so it emits exactly one JSON value (the first
   * match, or `null`). A bare `.reviews[] | select(...)` streams one document
   * per match, which is not parseable as a whole when more than one matches.
   */
  private filter(options: WaitForPrReviewOptions): string {
    return (
      `{review: (${this.reviewFilter(options)}), ` +
      `rateLimitComment: (${this.rateLimitFilter(options)}), ` +
      `commentUpdateFailedComment: (${this.commentUpdateFailedFilter(options)}), ` +
      `headRefOid: .headRefOid}`
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
   *
   * Also excludes any comment carrying `RECENT_REVIEW_START_MARKER` — i.e.
   * CodeRabbit's own rolling walkthrough comment. That comment's prose (a
   * summary, a changes table) can incidentally contain this filter's phrase
   * — notably on a PR whose diff is *about* rate-limit detection, such as
   * the one that introduced this guard (issue #465's own PR: the walkthrough
   * summarizing this very change said "prioritizes rate-limit results",
   * which matched `rate-limit` and produced a false `rateLimited: true`
   * despite the same comment already reporting a clean, completed review)
   * — which would otherwise abort the wait on a false positive before any
   * real review or genuine rate-limit notice exists. A genuine rate-limit
   * notice is always a short, separate comment (or, since this same fix, a
   * bounded section behind its own distinct markers — see
   * `rateLimitEditFilter`) and never carries the walkthrough markers, so
   * this guard costs nothing in real detection. Same rationale as
   * `commentUpdateFailedFilter`'s identical guard below.
   */
  private rateLimitFilter(options: WaitForPrReviewOptions): string {
    const excludeClause =
      options.excludeCommentId === undefined
        ? ''
        : ` and .id != ${JSON.stringify(options.excludeCommentId)}`;
    return (
      '[.comments[] | select(.createdAt != null) | ' +
      'select((.author.login // "") | test("coderabbit"; "i")) | ' +
      `select((.body // "") | contains(${JSON.stringify(RECENT_REVIEW_START_MARKER)}) | not) | ` +
      `select(((.body // "") | test(${JSON.stringify(RATE_LIMIT_PHRASES)}; "i")) and ` +
      `(.createdAt | fromdateiso8601) >= ${options.sinceEpochSeconds}` +
      `${excludeClause}) | ` +
      '{id: .id, body: .body, submittedAt: .createdAt}] | first'
    );
  }

  /**
   * Deliberately CodeRabbit-specific, and structurally identical to
   * `rateLimitFilter` — same `.comments[]` source, same author-login
   * narrowing, same watermark bound, same `[...] | first` wrapping, same
   * `RECENT_REVIEW_START_MARKER` exclusion — because this is the same kind
   * of signal: a top-level comment CodeRabbit posts *instead of* reviewing.
   * Only the phrase set and the exclusion id differ. See `rateLimitFilter`'s
   * doc comment for why the marker exclusion is needed.
   */
  private commentUpdateFailedFilter(options: WaitForPrReviewOptions): string {
    const excludeClause =
      options.excludeCommentUpdateFailureId === undefined
        ? ''
        : ` and .id != ${JSON.stringify(options.excludeCommentUpdateFailureId)}`;
    return (
      '[.comments[] | select(.createdAt != null) | ' +
      'select((.author.login // "") | test("coderabbit"; "i")) | ' +
      `select((.body // "") | contains(${JSON.stringify(RECENT_REVIEW_START_MARKER)}) | not) | ` +
      `select(((.body // "") | test(${JSON.stringify(COMMENT_UPDATE_FAILED_PHRASES)}; "i")) and ` +
      `(.createdAt | fromdateiso8601) >= ${options.sinceEpochSeconds}` +
      `${excludeClause}) | ` +
      '{id: .id, body: .body, submittedAt: .createdAt}] | first'
    );
  }

  /**
   * `{owner}`/`{repo}` are gh's own placeholders, resolved from the current
   * repository — this service has no owner/repo of its own, and the
   * `gh pr view` call above already relies on the same repo context.
   *
   * `since` is a server-side pre-filter on `updated_at` (the same watermark
   * the jq filter re-checks), backed off one second because GitHub documents
   * its bound only as "after the given time": a strict `>` there would drop
   * a comment edited in the watermark's own second. No `--paginate` — a page
   * of 100 *recently updated* comments is far more than a live review pass
   * can produce, and one bounded call per poll keeps the poll's cost fixed.
   */
  private commentsPath(options: WaitForPrReviewOptions): string {
    const since = new Date(
      (options.sinceEpochSeconds - 1) * 1000,
    ).toISOString();
    return (
      `repos/{owner}/{repo}/issues/${options.prNumber}/comments` +
      `?per_page=${COMMENTS_PER_PAGE}&since=${since}`
    );
  }

  /**
   * Deliberately CodeRabbit-specific, like `rateLimitFilter`. The rule,
   * stated identically here and in `handle-pr-reviews/SKILL.md`'s Phase 1:
   * the author login matches `coderabbit` (case-insensitive) **and** the
   * body contains a `<!-- recent_review_start -->…<!-- recent_review_end -->`
   * section whose contents match a "no actionable comments" style phrase.
   *
   * The phrase is tested against the *extracted section*, not the whole
   * body — the walkthrough is large and mentions plenty of unrelated text,
   * so a body-wide test would false-positive. A pass that did find
   * actionable comments will not match, and falls through to today's
   * behaviour unchanged.
   *
   * Wrapped in `[...] | first` for the same reason as the filters above: it
   * must emit exactly one JSON value (the first match, or `null`).
   */
  private completionFilter(options: WaitForPrReviewOptions): string {
    const excludeClause =
      options.excludeReviewId === undefined
        ? ''
        : ` | select(.id != ${JSON.stringify(options.excludeReviewId)})`;
    return (
      '[.[] | select(.updated_at != null) | ' +
      'select((.user.login // "") | test("coderabbit"; "i")) | ' +
      `select((.body // "") | contains(${JSON.stringify(RECENT_REVIEW_START_MARKER)})) | ` +
      `select((.updated_at | fromdateiso8601) >= ${options.sinceEpochSeconds}) | ` +
      '{id: ((.id | tostring) + "@" + ((.updated_at | fromdateiso8601) | tostring)), ' +
      'submittedAt: .updated_at, author: {login: (.user.login // "")}, ' +
      `section: (((.body // "") | capture(${JSON.stringify(RECENT_REVIEW_SECTION_PATTERN)})).section // "")}` +
      ` | select(.section | test(${JSON.stringify(NO_ACTIONABLE_COMMENTS_PHRASES)}; "i"))` +
      `${excludeClause}] | first`
    );
  }

  /**
   * Both rolling-comment signals in one jq program, so a poll still makes
   * exactly two `gh` calls. Each half is independently wrapped in
   * `[...] | first`, so each emits exactly one value — the first match, or
   * `null`.
   */
  private rollingCommentFilter(options: WaitForPrReviewOptions): string {
    return (
      `{completion: (${this.completionFilter(options)}), ` +
      `rateLimitEdit: (${this.rateLimitEditFilter(options)})}`
    );
  }

  /**
   * Deliberately CodeRabbit-specific, and structurally parallel to
   * `completionFilter` — same `.[]` REST source, same author-login narrowing,
   * same `updated_at` watermark, same bounded-section extraction — because it
   * is the same kind of signal, delivered the same way.
   *
   * Two deliberate differences from `completionFilter`:
   * - No composite id is built here and no exclusion is applied here. The id
   *   hashes the section's content, which jq cannot do; both happen in
   *   `rateLimitEditComment`.
   * - `excludeCommentId`, not `excludeReviewId`, is the exclusion that
   *   eventually applies — this is a rate-limit signal, the same logical
   *   thing `rateLimitFilter` produces, and callers already round-trip it as
   *   `--exclude-comment-id`.
   *
   * The phrase test here is the coarse first pass; `hasProsePhrase` in
   * TypeScript is the authoritative one.
   */
  private rateLimitEditFilter(options: WaitForPrReviewOptions): string {
    return (
      '[.[] | select(.updated_at != null) | ' +
      'select((.user.login // "") | test("coderabbit"; "i")) | ' +
      `select((.body // "") | contains(${JSON.stringify(RATE_LIMIT_EDIT_START_MARKER)})) | ` +
      `select((.updated_at | fromdateiso8601) >= ${options.sinceEpochSeconds}) | ` +
      '{id: (.id | tostring), submittedAt: .updated_at, ' +
      `section: (((.body // "") | capture(${JSON.stringify(RATE_LIMIT_EDIT_SECTION_PATTERN)})).section // "")}` +
      ` | select(.section | test(${JSON.stringify(RATE_LIMIT_PHRASES)}; "i"))] | first`
    );
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
   */
  private parseAvailableAt(comment: CodeRabbitComment): number | undefined {
    for (const sentence of comment.body.split(/(?<=[.!?])\s+|\n+/)) {
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
      return (
        Math.floor(new Date(comment.submittedAt).getTime() / 1000) +
        minutes * 60
      );
    }
    return undefined;
  }

  private sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
