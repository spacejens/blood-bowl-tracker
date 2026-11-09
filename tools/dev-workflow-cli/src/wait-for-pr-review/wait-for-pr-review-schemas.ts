import { z } from 'zod';

// Every schema here is consumed through `WaitForPrReviewService.validate`,
// which uses `safeParse` and turns any failure into `undefined`. That is
// deliberate and load-bearing: unlike `check-dependency-dashboard` and
// `post-review-questions`, which throw on a bad shape, a malformed `gh`/jq
// response here must read as "no match" so the poll loop retries on the next
// interval instead of aborting the whole wait. Never call `.parse()` on any
// of these.

/**
 * One JSON object out of a `gh --jq` result. Unknown keys are kept rather
 * than stripped (`looseObject`) because callers index into the parsed value
 * for filter-specific halves (`review`, `rateLimitComment`, `completion`,
 * `rateLimitEdit`, …) that this schema does not enumerate.
 */
export const jsonObjectSchema = z.looseObject({});

/**
 * A comment-shaped candidate out of the reviews call — a rate-limit
 * warning, a comment-update-failure notice, or a star-gate notice. All three
 * fields are required, not just `body`: a caller retrying off a candidate
 * missing `id` or `submittedAt` (develop-feature's Phase 6 steps b2/b3)
 * would build an unusable exclusion value or watermark.
 */
export const codeRabbitCommentSchema = z.object({
  id: z.string(),
  body: z.string(),
  submittedAt: z.string(),
});

/**
 * The fields both halves of the rolling-comment filter emit: the comment's
 * id, the `updated_at` that stands in for a review's `submittedAt`, and the
 * bounded section extracted from its body. A half that matched nothing is
 * `null` (what jq's `[] | first` yields), which fails this schema and so
 * reads as "no match" rather than as a half-built signal. `section` is kept
 * only long enough for the TypeScript phrase re-check (and, for a rate
 * limit, the composite id and wait-duration parse) — the completion half
 * never lets it reach the caller.
 */
export const sectionCandidateSchema = z.object({
  id: z.string(),
  submittedAt: z.string(),
  section: z.string(),
});

/**
 * The completion half: a section candidate plus the author the synthesized
 * review is attributed to, and the status block CodeRabbit puts its verdict
 * in (`""` when the body has none). Like `section`, `status` is only read by
 * the TypeScript phrase re-check and never reaches the caller.
 */
export const completionCandidateSchema = sectionCandidateSchema.extend({
  author: z.object({ login: z.string() }),
  status: z.string(),
});

/**
 * A review candidate, shaped only as far as `emptyBodyReviewId` needs it.
 *
 * `body` is `z.unknown()`, NOT `z.string().optional()`, on purpose: a
 * `null` or otherwise non-string body must still reach the "missing, null,
 * or blank" decision in `emptyBodyReviewId` and mark the review as needing
 * verification. Making the schema itself reject a non-string body would
 * instead fail the whole candidate, and a failed candidate there means
 * "trust it as-is" — turning an unverified artifact review into a reported
 * `found`.
 */
export const emptyBodyReviewCandidateSchema = z.object({
  id: z.string(),
  body: z.unknown(),
});

/** The PR's current head commit, as `gh pr view --json headRefOid` reports it. */
export const headRefOidSchema = z.string();

export type SectionCandidate = z.infer<typeof sectionCandidateSchema>;
export type CompletionCandidate = z.infer<typeof completionCandidateSchema>;

/**
 * A completed CodeRabbit pass, shaped like a formal review so it can be
 * returned through `WaitForPrReviewResult.review` with no new result field
 * and no caller change. `id` is the composite
 * `"<commentId>@<updatedAtEpochSeconds>"` — opaque to every caller, and
 * round-tripped back as `--exclude-review-id` on the next wait, where an
 * unchanged comment stays excluded while an edited one (advanced
 * `updated_at`, hence a different composite id) reads as a new pass.
 *
 * `commit.oid` is the PR head commit the comment's `recent_review` section
 * was validated against: the `headRefOid` read in the same poll, which the
 * section must name. It mirrors the `commit.oid` a formal review carries, so
 * a caller compares either kind with the PR's current head the same way.
 */
export interface CompletionReview {
  readonly id: string;
  readonly submittedAt: string;
  readonly author: { readonly login: string };
  readonly commit: { readonly oid: string };
}
