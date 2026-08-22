import { Test } from '@nestjs/testing';
import { mock, MockProxy } from 'vitest-mock-extended';

import { ProcessRunnerService } from '../shared/process-runner.service';
import { PullRequestReviewCommentsService } from './pull-request-review-comments.service';
import { WaitForPrReviewService } from './wait-for-pr-review.service';
import { WaitForPrReviewFiltersService } from './wait-for-pr-review-filters.service';

export const REVIEW = {
  id: 'PRR_review1',
  author: { login: 'coderabbitai' },
  state: 'COMMENTED',
  /**
   * Non-empty on purpose: a review with a body short-circuits the
   * inline-comment verification entirely, which is the common path every
   * pre-existing test in this directory exercises.
   */
  body: 'Actionable comments posted: 2',
  submittedAt: '2026-08-11T10:00:00Z',
};

/**
 * The artifact shape from issue #474 (PR #469): a formally submitted review
 * from a non-author with an empty body, produced while CodeRabbit was
 * actually rate-limited and never ran a real pass.
 */
export const EMPTY_BODY_REVIEW = {
  id: 'PRR_empty1',
  author: { login: 'coderabbitai' },
  state: 'COMMENTED',
  body: '',
  submittedAt: '2026-08-11T10:00:00Z',
};

export const RATE_LIMIT_COMMENT = {
  id: 'IC_comment1',
  body: '> [!WARNING]\n> Rate limit exceeded.',
  submittedAt: '2026-08-11T10:00:00Z',
};

/**
 * `parseAvailableAt` anchors to the rate-limit comment's own `submittedAt`,
 * not `Date.now()` — a stale/re-matched comment should not get a
 * freshly-computed wait. Every parsed-wait-time test expects its result
 * relative to this fixed instant, not to whatever "now" is when the test
 * happens to run.
 */
export const RATE_LIMIT_COMMENT_EPOCH_SECONDS = Math.floor(
  new Date(RATE_LIMIT_COMMENT.submittedAt).getTime() / 1000,
);

/**
 * CodeRabbit's own wording for the third non-review outcome, observed on
 * PR #408: it failed to persist an edit to its rolling walkthrough comment
 * and posted this separate top-level comment instead.
 */
export const COMMENT_UPDATE_FAILED_COMMENT = {
  id: 'IC_update1',
  body:
    "CodeRabbit couldn't update its existing comment. The review summary " +
    'may be out of date. Error details: putComment timed out.',
  submittedAt: '2026-08-11T10:05:00Z',
};

/**
 * The PR's current head commit, as `gh pr view --json headRefOid` would
 * report it. Real second SHA from the "Reviewing files that changed... between
 * X and Y" sentence observed on PR #402.
 */
export const HEAD_REF_OID = 'cd43d0404e4675811bc8242811f787ed19fa7e41';

/**
 * Locates the `--jq` program text within a `gh` call's args, by finding the
 * `--jq` flag rather than assuming a fixed positional index. Indexing
 * directly (e.g. `args[6]`) is brittle: an inserted `gh` flag elsewhere would
 * silently shift that index and the assertion would then read the wrong
 * string without failing loudly.
 */
export function jqProgramOf(args: readonly string[]): string {
  const index = args.indexOf('--jq');
  if (index === -1 || index + 1 >= args.length) {
    throw new Error(`No --jq program in args: ${JSON.stringify(args)}`);
  }
  return args[index + 1];
}

/** A `gh pr view` invocation whose review half matched the given review. */
export function foundReview(review: unknown) {
  return {
    exitCode: 0,
    stdout: `${JSON.stringify({
      review,
      rateLimitComment: null,
      commentUpdateFailedComment: null,
      headRefOid: HEAD_REF_OID,
    })}\n`,
    stderr: '',
  };
}

/** A `gh pr view` invocation whose only match is the empty artifact review. */
export const EMPTY_BODY_FOUND = foundReview(EMPTY_BODY_REVIEW);

/**
 * A `gh pr view` invocation that found nothing on the reviews-call side:
 * `review` and `rateLimitComment` are both null (a missing
 * `commentUpdateFailedComment` field is tolerated the same as an explicit
 * null). Only the reviews-call halves — the rolling-comment call is a
 * separate `gh api` invocation with its own `{completion, rateLimitEdit}`
 * shape, built by `rollingResult`/`completionResult`/`rateLimitEditResult`
 * below.
 */
export const EMPTY = {
  exitCode: 0,
  stdout: `{"review":null,"rateLimitComment":null,"headRefOid":"${HEAD_REF_OID}"}\n`,
  stderr: '',
};
/** A `gh` invocation that found a qualifying review and no rate-limit comment. */
export const FOUND = {
  exitCode: 0,
  stdout: `${JSON.stringify({ review: REVIEW, rateLimitComment: null, headRefOid: HEAD_REF_OID }, null, 2)}\n`,
  stderr: '',
};
/** A `gh` invocation that found a rate-limit comment and no review. */
export const RATE_LIMITED = {
  exitCode: 0,
  stdout: `${JSON.stringify({ review: null, rateLimitComment: RATE_LIMIT_COMMENT, headRefOid: HEAD_REF_OID }, null, 2)}\n`,
  stderr: '',
};
/** A `gh` invocation that found a comment-update-failure comment and nothing else. */
export const COMMENT_UPDATE_FAILED = {
  exitCode: 0,
  stdout: `${JSON.stringify({ review: null, rateLimitComment: null, commentUpdateFailedComment: COMMENT_UPDATE_FAILED_COMMENT, headRefOid: HEAD_REF_OID }, null, 2)}\n`,
  stderr: '',
};

export const OPTIONS = {
  prNumber: '392',
  developerLogin: 'spacejens',
  sinceEpochSeconds: 1_760_000_000,
};

/**
 * The bounded `<!-- recent_review_start -->…<!-- recent_review_end -->` body
 * of CodeRabbit's rolling walkthrough comment, as jq extracts it — real text
 * observed on PR #402. Includes the "Reviewing files that changed... between
 * X and Y" sentence so the section covers the current head commit
 * (`HEAD_REF_OID`, the later of the two SHAs) — required for the freshness
 * cross-check added alongside `updated_at`.
 */
const COMPLETION_SECTION =
  '\n\nNo actionable comments were generated in the recent review. 🎉\n\n' +
  'Reviewing files that changed from the base of the PR and between ' +
  `\`e44832555c4036093c6dcb7c9ad9da576c8f6adc\` and \`${HEAD_REF_OID}\`.\n\n`;
/** What the completion jq filter emits for a qualifying comment. */
export const COMPLETION_CANDIDATE = {
  id: '5263781074@1786521319',
  submittedAt: '2026-08-12T07:55:19Z',
  author: { login: 'coderabbitai[bot]' },
  section: COMPLETION_SECTION,
};
/**
 * The review-shaped object the service synthesizes from it. Note the absent
 * `section`: the extracted walkthrough text is an implementation detail of
 * the phrase check and must never leak into the caller's result.
 */
export const COMPLETION_REVIEW = {
  id: '5263781074@1786521319',
  submittedAt: '2026-08-12T07:55:19Z',
  author: { login: 'coderabbitai[bot]' },
};

/** Everything a spec needs to drive one freshly-compiled service instance. */
export interface WaitForPrReviewHarness {
  readonly service: WaitForPrReviewService;
  readonly processRunner: MockProxy<ProcessRunnerService>;
  readonly reviewComments: MockProxy<PullRequestReviewCommentsService>;
}

/**
 * Compiles the service through `Test.createTestingModule` with its I/O
 * dependency mocked — the repo's standard service-spec shape, shared here so
 * every spec file builds the subject identically and freshly per test.
 *
 * `WaitForPrReviewFiltersService` is the deliberate exception CLAUDE.md
 * documents for a pure, dependency-free formatting service: it only assembles
 * jq program text, and these specs assert on that exact text, which mocking
 * would leave unasserted.
 */
export async function createHarness(): Promise<WaitForPrReviewHarness> {
  const processRunner = mock<ProcessRunnerService>();
  const reviewComments = mock<PullRequestReviewCommentsService>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      WaitForPrReviewService,
      WaitForPrReviewFiltersService,
      { provide: ProcessRunnerService, useValue: processRunner },
      { provide: PullRequestReviewCommentsService, useValue: reviewComments },
    ],
  }).compile();
  return {
    service: moduleRef.get(WaitForPrReviewService),
    processRunner,
    reviewComments,
  };
}

/**
 * A `gh api .../comments` invocation whose jq filter emitted the combined
 * `{completion, rateLimitEdit}` object one poll now asks for. jq emits `null`
 * for an empty half, so an omitted half is written out as `null`, not
 * dropped.
 */
export function rollingResult(payload: {
  completion?: unknown;
  rateLimitEdit?: unknown;
}) {
  return {
    exitCode: 0,
    stdout: `${JSON.stringify({
      completion: payload.completion ?? null,
      rateLimitEdit: payload.rateLimitEdit ?? null,
    })}\n`,
    stderr: '',
  };
}

/** A `gh api .../comments` invocation whose only match is a completion candidate. */
export function completionResult(candidate: unknown) {
  return rollingResult({ completion: candidate });
}

/** A `gh api .../comments` invocation whose only match is a rate-limit-edit candidate. */
export function rateLimitEditResult(candidate: unknown) {
  return rollingResult({ rateLimitEdit: candidate });
}

/** A completion candidate whose extracted section is replaced wholesale. */
export function completionWithSection(section: string) {
  return completionResult({ ...COMPLETION_CANDIDATE, section });
}

/** Builds a `gh` result whose only match is a rate-limit comment with the given body. */
export function rateLimitedWithBody(body: string) {
  return {
    exitCode: 0,
    stdout: JSON.stringify({
      review: null,
      rateLimitComment: { ...RATE_LIMIT_COMMENT, body },
    }),
    stderr: '',
  };
}

/** Builds a `gh` result whose only match is a comment-update-failure comment with the given body. */
export function commentUpdateFailedWithBody(body: string) {
  return {
    exitCode: 0,
    stdout: JSON.stringify({
      review: null,
      rateLimitComment: null,
      commentUpdateFailedComment: { ...COMMENT_UPDATE_FAILED_COMMENT, body },
    }),
    stderr: '',
  };
}
