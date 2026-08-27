import {
  ProcessResult,
  ProcessRunnerService,
} from '@blood-bowl-tracker/cli-shared';
import { Injectable } from '@nestjs/common';

import { DiffHunkMembershipService } from './diff-hunk-membership.service';

/** One question to post, in the caller's own words — untagged, unformatted. */
export interface ReviewQuestion {
  readonly file: string;
  readonly line: number;
  readonly body: string;
}

export interface PostReviewQuestionsInput {
  readonly prNumber: string;
  readonly questions: readonly ReviewQuestion[];
}

/** Where and how one question actually landed. */
export interface PostedQuestion {
  readonly file: string;
  readonly line: number;
  readonly mode: 'inline' | 'top-level';
  /** Absent when the `gh` call's stdout was empty. */
  readonly url?: string;
}

export interface FailedQuestion {
  readonly file: string;
  readonly line: number;
  readonly error: string;
}

export interface PostReviewQuestionsResult {
  readonly posted: readonly PostedQuestion[];
  readonly failed: readonly FailedQuestion[];
}

/**
 * Tags every comment this service posts as Claude's own, so a human skimming
 * the PR can tell it apart from a developer's own comment. Kept in one
 * constant so a rename touches only this line.
 */
const COMMENT_TAG = '**Comment by Claude**';

/** Every `gh` call this service makes is bounded by this timeout. */
const POST_TIMEOUT_MS = 30_000;

/**
 * `gh`'s own text for a 422 response — e.g. "Validation Failed (HTTP 422)"
 * on stderr — used to detect a line-not-in-diff rejection from the inline
 * pulls-comments endpoint, distinct from any other failure.
 */
const HTTP_422_PATTERN = /http 422/i;

/** One outcome of attempting to post a question inline. */
type InlineOutcome =
  | { readonly kind: 'posted'; readonly posted: PostedQuestion }
  | { readonly kind: 'fallback' }
  | { readonly kind: 'failed'; readonly failed: FailedQuestion };

/** One outcome of attempting to post a question as a top-level comment. */
type TopLevelOutcome =
  | { readonly kind: 'posted'; readonly posted: PostedQuestion }
  | { readonly kind: 'failed'; readonly failed: FailedQuestion };

/**
 * `failedQuestion`'s inputs bundled into one object: `question` and `mode`
 * alone plus either `error` (a rejected `run`) or `stderr` (a resolved,
 * non-zero exit) would be a 4th positional parameter, over this repo's
 * 3-parameter limit (`local/max-function-params`).
 */
interface FailedQuestionOptions {
  readonly question: ReviewQuestion;
  readonly mode: 'inline' | 'top-level';
  readonly error?: unknown;
  readonly stderr?: string;
}

/**
 * Posts a batch of self-review questions to a PR — inline on the diff line
 * when possible, falling back to a top-level issue comment otherwise (a line
 * outside the diff, or GitHub rejecting the inline attempt). Every question
 * is attempted independently: one failure never aborts the rest, and `run`
 * itself never throws to its caller.
 */
@Injectable()
export class PostReviewQuestionsService {
  constructor(
    private readonly processRunner: ProcessRunnerService,
    private readonly diffHunkMembership: DiffHunkMembershipService,
  ) {}

  async run(
    input: PostReviewQuestionsInput,
  ): Promise<PostReviewQuestionsResult> {
    const posted: PostedQuestion[] = [];
    const failed: FailedQuestion[] = [];
    if (input.questions.length === 0) {
      return { posted, failed };
    }

    const headSha = await this.resolveHeadSha(input.prNumber);

    // Sequential, not Promise.all: questions are posted in input order so
    // `posted`/`failed` preserve that order deterministically.
    for (const question of input.questions) {
      const inDiff =
        headSha !== undefined &&
        (await this.diffHunkMembership.includesLine(
          question.file,
          question.line,
        ));

      if (inDiff) {
        const outcome = await this.postInline(
          input.prNumber,
          headSha,
          question,
        );
        if (outcome.kind === 'posted') {
          posted.push(outcome.posted);
          continue;
        }
        if (outcome.kind === 'failed') {
          failed.push(outcome.failed);
          continue;
        }
        // kind === 'fallback' (a 422): fall through to the top-level post.
      }

      const fallback = await this.postTopLevel(input.prNumber, question);
      if (fallback.kind === 'posted') {
        posted.push(fallback.posted);
      } else {
        failed.push(fallback.failed);
      }
    }

    return { posted, failed };
  }

  /**
   * Best-effort: a failed or empty lookup here does not abort the run, it
   * just means every question falls straight through to the top-level
   * fallback — surfacing questions beats surfacing nothing.
   */
  private async resolveHeadSha(prNumber: string): Promise<string | undefined> {
    let result: ProcessResult;
    try {
      result = await this.processRunner.run(
        'gh',
        ['api', `repos/{owner}/{repo}/pulls/${prNumber}`, '--jq', '.head.sha'],
        POST_TIMEOUT_MS,
      );
    } catch {
      return undefined;
    }
    if (result.exitCode !== 0) {
      return undefined;
    }
    const sha = result.stdout.trim();
    return sha === '' ? undefined : sha;
  }

  private async postInline(
    prNumber: string,
    headSha: string,
    question: ReviewQuestion,
  ): Promise<InlineOutcome> {
    let result: ProcessResult;
    try {
      result = await this.processRunner.run(
        'gh',
        [
          'api',
          `repos/{owner}/{repo}/pulls/${prNumber}/comments`,
          '-f',
          `commit_id=${headSha}`,
          '-f',
          `path=${question.file}`,
          '-f',
          'side=RIGHT',
          '-F',
          `line=${question.line}`,
          '-f',
          `body=${this.inlineBody(question.body)}`,
          '--jq',
          '.html_url',
        ],
        POST_TIMEOUT_MS,
      );
    } catch (error) {
      return {
        kind: 'failed',
        failed: this.failedQuestion({ question, mode: 'inline', error }),
      };
    }
    if (result.exitCode === 0) {
      return {
        kind: 'posted',
        posted: this.postedQuestion(question, 'inline', result.stdout),
      };
    }
    if (this.isHttp422(result)) {
      return { kind: 'fallback' };
    }
    return {
      kind: 'failed',
      failed: this.failedQuestion({
        question,
        mode: 'inline',
        stderr: result.stderr,
      }),
    };
  }

  private async postTopLevel(
    prNumber: string,
    question: ReviewQuestion,
  ): Promise<TopLevelOutcome> {
    let result: ProcessResult;
    try {
      result = await this.processRunner.run(
        'gh',
        [
          'api',
          `repos/{owner}/{repo}/issues/${prNumber}/comments`,
          '-f',
          `body=${this.topLevelBody(question)}`,
          '--jq',
          '.html_url',
        ],
        POST_TIMEOUT_MS,
      );
    } catch (error) {
      return {
        kind: 'failed',
        failed: this.failedQuestion({ question, mode: 'top-level', error }),
      };
    }
    if (result.exitCode === 0) {
      return {
        kind: 'posted',
        posted: this.postedQuestion(question, 'top-level', result.stdout),
      };
    }
    return {
      kind: 'failed',
      failed: this.failedQuestion({
        question,
        mode: 'top-level',
        stderr: result.stderr,
      }),
    };
  }

  private inlineBody(body: string): string {
    return `${COMMENT_TAG}\n\n${body}`;
  }

  /**
   * The file and line go in the text (rather than relying on an inline
   * anchor, which a top-level comment has none of) so the reader still knows
   * which question this is about.
   */
  private topLevelBody(question: ReviewQuestion): string {
    return `${COMMENT_TAG}\n\n\`${question.file}:${question.line}\`\n\n${question.body}`;
  }

  private postedQuestion(
    question: ReviewQuestion,
    mode: 'inline' | 'top-level',
    stdout: string,
  ): PostedQuestion {
    const url = stdout.trim();
    return {
      file: question.file,
      line: question.line,
      mode,
      ...(url === '' ? {} : { url }),
    };
  }

  /**
   * `gh` reports a 422 as text like "Validation Failed (HTTP 422)" on
   * stderr, so the exact message shape is unpredictable — matching the
   * "HTTP 422" substring case-insensitively across both streams is a much
   * more robust signal than parsing the whole sentence.
   */
  private isHttp422(result: ProcessResult): boolean {
    return HTTP_422_PATTERN.test(`${result.stderr}${result.stdout}`);
  }

  private failedQuestion(options: FailedQuestionOptions): FailedQuestion {
    const { question, mode, error, stderr } = options;
    return {
      file: question.file,
      line: question.line,
      error: this.failureMessage({ mode, error, stderr }),
    };
  }

  /**
   * Trimmed stderr wins when present (the most specific signal `gh` gives);
   * otherwise a rejected `run`'s own `Error#message`; otherwise a short
   * generic string naming the attempted mode, so a caller always gets a
   * usable string even from an unexpected failure shape.
   */
  private failureMessage(options: {
    readonly mode: 'inline' | 'top-level';
    readonly error?: unknown;
    readonly stderr?: string;
  }): string {
    const trimmedStderr = options.stderr?.trim();
    if (trimmedStderr) {
      return trimmedStderr;
    }
    if (options.error instanceof Error) {
      return options.error.message;
    }
    return `failed to post ${options.mode} comment`;
  }
}
