import { Injectable } from '@nestjs/common';

/**
 * The subset of `WaitForPrReviewOptions` the jq programs actually read.
 * Declared structurally here rather than imported from
 * `wait-for-pr-review.service.ts` so the two files have no import cycle;
 * `WaitForPrReviewOptions` satisfies it structurally, so callers pass their
 * options object straight through.
 */
export interface WaitForPrReviewFilterOptions {
  readonly prNumber: string;
  readonly developerLogin: string;
  readonly sinceEpochSeconds: number;
  readonly excludeReviewId?: string;
  /**
   * Additional review ids to exclude, on top of `excludeReviewId` — every id
   * in this list gets its own `.id != ...` clause in `reviewFilter`. Used
   * internally by `WaitForPrReviewService.run` to accumulate ids of
   * discarded empty-artifact reviews across polls within one wait, without
   * ever touching the caller's own `excludeReviewId` (which `completionFilter`
   * also reads, and which must survive untouched for the whole wait — see
   * `run`'s doc comment in wait-for-pr-review.service.ts).
   */
  readonly excludeReviewIds?: readonly string[];
  readonly excludeCommentId?: string;
  readonly excludeCommentUpdateFailureId?: string;
}

/**
 * Tolerant, deliberately CodeRabbit-specific wording match. The exact
 * rate-limit comment text is unknown and may drift, so any one of these
 * phrases (case-insensitive) qualifies.
 */
export const RATE_LIMIT_PHRASES =
  'rate limit|rate-limit|review limit|usage limit';
/**
 * Tolerant, deliberately CodeRabbit-specific wording for its third
 * non-review outcome: it failed to persist an edit to its rolling
 * walkthrough comment and posted a separate top-level notice instead —
 * observed in practice: "CodeRabbit couldn't update its existing comment.
 * The review summary may be out of date. Error details: putComment timed
 * out." Same tolerance rationale as `RATE_LIMIT_PHRASES` — the exact text
 * is CodeRabbit's own and may drift, so any one of these phrases
 * (case-insensitive) qualifies. The character class accepts both a straight
 * and a typographic apostrophe.
 */
export const COMMENT_UPDATE_FAILED_PHRASES =
  "couldn['’]t update its existing comment|" +
  'could not update its existing comment|' +
  "can['’]t update its existing comment|" +
  'cannot update its existing comment';
/**
 * Tolerant, deliberately CodeRabbit-specific wording for a fourth
 * non-review outcome: automatic reviews are disabled repo-wide because it
 * has fewer stars than CodeRabbit's own free-tier threshold — observed in
 * practice: "This repository does not receive automatic reviews because it
 * has fewer than 10 stars." Matches only the stable clause, not the star
 * count itself, since CodeRabbit could change that threshold independently
 * of this wording. Same tolerance rationale as `RATE_LIMIT_PHRASES`.
 */
export const STAR_GATE_PHRASES = 'does not receive automatic reviews';
/**
 * Marks CodeRabbit's own auto-generated reply to a slash-style command like
 * `@coderabbitai review` — distinct from a spontaneous top-level notice.
 * Excluded from `rateLimitFilter` and `commentUpdateFailedFilter` for the
 * same reason `RECENT_REVIEW_START_MARKER` is excluded from them: a reply
 * to a manual trigger that itself bounced off the still-active rate limit
 * (observed in practice: "⚠️ Action not completed\n\nReview rate
 * limited.") carries no wait duration of its own, and unlike the notice
 * that first reported the rate limit, it is not stable-id-excludable by the
 * caller (each command produces a fresh reply). Matching it as a new,
 * duration-less rate-limit event would silently discard whatever real
 * duration the caller already learned from that earlier notice, and would
 * force a fresh "unknown duration" decision every time a trigger predictably
 * bounces off an already-known limit. This exclusion applies regardless of
 * which comment kind's phrase happens to also appear in the reply's own
 * body — the marker alone is enough to identify it as a command reply.
 */
const COMMAND_REPLY_MARKER =
  '<!-- This is an auto-generated reply by CodeRabbit -->';
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
export const NO_ACTIONABLE_COMMENTS_PHRASES =
  'no actionable comments|no actionable issues|nothing to report|no comments were generated';
/**
 * Opens the block CodeRabbit edits into its *existing* rolling walkthrough
 * comment when it rate-limits a re-review — no new comment is posted, and the
 * comment's `createdAt` never moves, which is exactly why `rateLimitFilter`
 * (which reads `gh pr view --json comments`, a payload with no `updated_at`)
 * cannot see it — observed in practice.
 *
 * CAUTION FOR FUTURE EDITORS: these two constants are themselves
 * self-referential source text on a PR that touches this file — CodeRabbit's
 * own walkthrough quoting this file's diff would put a literal marker pair
 * into its own comment body. Today that costs nothing: the raw text between
 * the two `const` declarations contains no `RATE_LIMIT_PHRASES` match, so
 * `select(.section | test(...))` in `rateLimitEditFilter` drops the element.
 * But two things follow, and neither is worth engineering around for how
 * narrow and self-limited this is (it requires CodeRabbit to quote this
 * exact file's raw source): (a) do not add "rate limit" wording to this pair
 * of doc comments — that would make the service detect itself; and (b) `jq`'s
 * `capture` is a single, non-greedy match per comment body, so a *genuine*
 * rate-limit block sharing a comment with a quoted copy of these markers
 * could have its own span shadowed by the quoted one if the quoted pair
 * comes first in the body — this is a real gap, not just a false positive,
 * but only on PRs that touch this file specifically.
 */
const RATE_LIMIT_EDIT_START_MARKER =
  '<!-- This is an auto-generated comment: rate limited by coderabbit.ai -->';
/**
 * Closes it. Both markers must be present for the section to be extractable —
 * same paired-marker discipline as the completion section above, and for the
 * same reason: the phrase test and the wait-duration parse must see the
 * warning block only, never the whole (very large) walkthrough body. See the
 * caution on `RATE_LIMIT_EDIT_START_MARKER` above before editing either.
 */
const RATE_LIMIT_EDIT_END_MARKER =
  '<!-- end of auto-generated comment: rate limited by coderabbit.ai -->';
/** Same `[\s\S]`/non-greedy rationale as `RECENT_REVIEW_SECTION_PATTERN`. */
const RATE_LIMIT_EDIT_SECTION_PATTERN = `${RATE_LIMIT_EDIT_START_MARKER}(?<section>[\\s\\S]*?)${RATE_LIMIT_EDIT_END_MARKER}`;
/** Bounds the unpaginated comments request; far more than one pass can edit. */
const COMMENTS_PER_PAGE = 100;

/**
 * Every jq program and REST path one wait's polls need. Pure string assembly
 * with no dependencies of its own — split out of `WaitForPrReviewService`
 * because that file sits at this repo's 500-line ceiling, and because filter
 * construction is a self-contained concern from poll decision-making.
 */
@Injectable()
export class WaitForPrReviewFiltersService {
  /**
   * One object per poll, holding both halves of the query. Each half is
   * wrapped in `[...] | first` so it emits exactly one JSON value (the first
   * match, or `null`). A bare `.reviews[] | select(...)` streams one document
   * per match, which is not parseable as a whole when more than one matches.
   */
  reviewsCall(options: WaitForPrReviewFilterOptions): string {
    return (
      `{review: (${this.reviewFilter(options)}), ` +
      `rateLimitComment: (${this.rateLimitFilter(options)}), ` +
      `commentUpdateFailedComment: (${this.commentUpdateFailedFilter(options)}), ` +
      `starGateComment: (${this.starGateFilter(options)}), ` +
      `headRefOid: .headRefOid}`
    );
  }

  /**
   * Both rolling-comment signals in one jq program, so a poll still makes
   * exactly two `gh` calls. Each half is independently wrapped in
   * `[...] | first`, so each emits exactly one value — the first match, or
   * `null`.
   */
  rollingComment(options: WaitForPrReviewFilterOptions): string {
    return (
      `{completion: (${this.completionFilter(options)}), ` +
      `rateLimitEdit: (${this.rateLimitEditFilter(options)})}`
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
  commentsPath(options: WaitForPrReviewFilterOptions): string {
    const since = new Date(
      (options.sinceEpochSeconds - 1) * 1000,
    ).toISOString();
    return (
      `repos/{owner}/{repo}/issues/${options.prNumber}/comments` +
      `?per_page=${COMMENTS_PER_PAGE}&since=${since}`
    );
  }

  /** Bot-agnostic by construction: any formal review object from a non-author. */
  private reviewFilter(options: WaitForPrReviewFilterOptions): string {
    const login = JSON.stringify(options.developerLogin);
    const excludedIds = [
      ...(options.excludeReviewId === undefined
        ? []
        : [options.excludeReviewId]),
      ...(options.excludeReviewIds ?? []),
    ];
    const excludeClause = excludedIds
      .map((id) => ` and .id != ${JSON.stringify(id)}`)
      .join('');
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
   * — notably on a PR whose diff is *about* rate-limit detection, where the
   * walkthrough's own summary of the change could match `rate-limit` despite
   * the same comment already reporting a clean, completed review — which
   * would otherwise abort the wait on a false positive before any real
   * review or genuine rate-limit notice exists. A genuine rate-limit notice
   * is always a short, separate comment, or a bounded section behind its own
   * distinct markers (see `rateLimitEditFilter`), and never carries the
   * walkthrough markers, so this guard costs nothing in real detection.
   * Same rationale as `commentUpdateFailedFilter`'s identical guard below.
   *
   * Also excludes any comment carrying `COMMAND_REPLY_MARKER` — see that
   * constant's doc comment for why a manual-trigger command reply must
   * never be matched here.
   *
   * Also excludes any comment carrying `RATE_LIMIT_EDIT_START_MARKER` — the
   * rolling walkthrough comment CodeRabbit edits a rate-limit block into,
   * which `rateLimitEditFilter` and `rateLimitEditComment` own exclusively.
   * The `RECENT_REVIEW_START_MARKER` exclusion above does not cover it: a
   * pass rate-limited before any review has completed carries the rate-limit
   * markers with no `recent_review` section yet. Without this guard both
   * detectors match that one comment, and they report it under *different*
   * ids — this filter under the raw GitHub comment id, the rolling detector
   * under a composite id pairing that raw id with a section fingerprint — so
   * whichever id the caller round-trips as `excludeCommentId` suppresses only
   * one of the two, and the wait alternates between them forever. Preventing
   * the double match here keeps the two id spaces disjoint, and leaves the
   * rolling detector's content fingerprint free to keep distinguishing a
   * genuinely new rate-limit edit from an already-seen one. Two consequences
   * follow: if the REST call behind `rateLimitEditFilter` fails or times out
   * on a given poll, this exclusion means the GraphQL path no longer reports
   * that rate limit either, so the poll simply finds nothing and the wait
   * continues to its next poll (or eventual timeout) rather than losing
   * correctness, since a later poll's REST call can still succeed; and
   * because this exclusion matches on the start marker alone while
   * `rateLimitEditFilter` requires a *paired* start-and-end marker plus a
   * phrase match against the extracted section, a comment carrying the start
   * marker without its matching end marker (e.g. a body truncated mid-edit)
   * is excluded here but may not be positively matched by the REST side
   * either — a narrow case neither detector catches on that poll, which is
   * acceptable because the fail-safe direction is always "wait continues /
   * eventually times out", never a false positive.
   */
  private rateLimitFilter(options: WaitForPrReviewFilterOptions): string {
    const excludeClause =
      options.excludeCommentId === undefined
        ? ''
        : ` and .id != ${JSON.stringify(options.excludeCommentId)}`;
    return (
      '[.comments[] | select(.createdAt != null) | ' +
      'select((.author.login // "") | test("coderabbit"; "i")) | ' +
      `select((.body // "") | contains(${JSON.stringify(RECENT_REVIEW_START_MARKER)}) | not) | ` +
      `select((.body // "") | contains(${JSON.stringify(COMMAND_REPLY_MARKER)}) | not) | ` +
      `select((.body // "") | contains(${JSON.stringify(RATE_LIMIT_EDIT_START_MARKER)}) | not) | ` +
      `select(((.body // "") | test(${JSON.stringify(RATE_LIMIT_PHRASES)}; "i")) and ` +
      `(.createdAt | fromdateiso8601) >= ${options.sinceEpochSeconds}` +
      `${excludeClause}) | ` +
      '{id: .id, body: .body, submittedAt: .createdAt}] | first'
    );
  }

  /**
   * Deliberately CodeRabbit-specific, and structurally near-identical to
   * `rateLimitFilter` — same `.comments[]` source, same author-login
   * narrowing, same watermark bound, same `[...] | first` wrapping, same
   * `RECENT_REVIEW_START_MARKER` and `COMMAND_REPLY_MARKER` exclusions —
   * because this is the same kind of signal: a top-level comment CodeRabbit
   * posts *instead of* reviewing. Only the phrase set and the exclusion id
   * differ. See `rateLimitFilter`'s doc comment for why the marker
   * exclusions are needed. It deliberately lacks `rateLimitFilter`'s
   * `RATE_LIMIT_EDIT_START_MARKER` exclusion: CodeRabbit posts a
   * comment-update-failure notice as its own top-level comment, never as an
   * edit to the rolling comment, so there is no REST-side detector for this
   * filter to avoid colliding with.
   */
  private commentUpdateFailedFilter(
    options: WaitForPrReviewFilterOptions,
  ): string {
    const excludeClause =
      options.excludeCommentUpdateFailureId === undefined
        ? ''
        : ` and .id != ${JSON.stringify(options.excludeCommentUpdateFailureId)}`;
    return (
      '[.comments[] | select(.createdAt != null) | ' +
      'select((.author.login // "") | test("coderabbit"; "i")) | ' +
      `select((.body // "") | contains(${JSON.stringify(RECENT_REVIEW_START_MARKER)}) | not) | ` +
      `select((.body // "") | contains(${JSON.stringify(COMMAND_REPLY_MARKER)}) | not) | ` +
      `select(((.body // "") | test(${JSON.stringify(COMMENT_UPDATE_FAILED_PHRASES)}; "i")) and ` +
      `(.createdAt | fromdateiso8601) >= ${options.sinceEpochSeconds}` +
      `${excludeClause}) | ` +
      '{id: .id, body: .body, submittedAt: .createdAt}] | first'
    );
  }

  /**
   * Deliberately CodeRabbit-specific, structurally identical to
   * `rateLimitFilter` and `commentUpdateFailedFilter` — same `.comments[]`
   * source, same author-login narrowing, same watermark bound, same
   * `RECENT_REVIEW_START_MARKER` exclusion. Unlike those two, this signal
   * never surfaces to a caller as its own result field: `run()` reacts to it
   * internally by posting the trigger comment once, so there is no exclusion
   * id to plumb through here — once a review lands, a later wait's watermark
   * has already advanced past this comment's `createdAt`.
   */
  private starGateFilter(options: WaitForPrReviewFilterOptions): string {
    return (
      '[.comments[] | select(.createdAt != null) | ' +
      'select((.author.login // "") | test("coderabbit"; "i")) | ' +
      `select((.body // "") | contains(${JSON.stringify(RECENT_REVIEW_START_MARKER)}) | not) | ` +
      `select(((.body // "") | test(${JSON.stringify(STAR_GATE_PHRASES)}; "i")) and ` +
      `(.createdAt | fromdateiso8601) >= ${options.sinceEpochSeconds}) | ` +
      '{id: .id, body: .body, submittedAt: .createdAt}] | first'
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
  private completionFilter(options: WaitForPrReviewFilterOptions): string {
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
  private rateLimitEditFilter(options: WaitForPrReviewFilterOptions): string {
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
}
