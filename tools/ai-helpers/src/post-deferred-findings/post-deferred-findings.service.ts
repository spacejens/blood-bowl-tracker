import { Injectable } from '@nestjs/common';

import {
  ProcessResult,
  ProcessRunnerService,
} from '../shared/process-runner.service';
import { DiffHunkMembershipService } from './diff-hunk-membership.service';

/** One finding to post, in the caller's own words — untagged, unformatted. */
export interface DeferredFinding {
  readonly file: string;
  readonly line: number;
  readonly body: string;
}

export interface PostDeferredFindingsInput {
  readonly prNumber: string;
  readonly findings: readonly DeferredFinding[];
}

/** Where and how one finding actually landed. */
export interface PostedFinding {
  readonly file: string;
  readonly line: number;
  readonly mode: 'inline' | 'top-level';
  /** Absent when the `gh` call's stdout was empty. */
  readonly url?: string;
}

export interface FailedFinding {
  readonly file: string;
  readonly line: number;
  readonly error: string;
}

export interface PostDeferredFindingsResult {
  readonly posted: readonly PostedFinding[];
  readonly failed: readonly FailedFinding[];
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

/** One outcome of attempting to post a finding inline. */
type InlineOutcome =
  | { readonly kind: 'posted'; readonly posted: PostedFinding }
  | { readonly kind: 'fallback' }
  | { readonly kind: 'failed'; readonly failed: FailedFinding };

/** One outcome of attempting to post a finding as a top-level comment. */
type TopLevelOutcome =
  | { readonly kind: 'posted'; readonly posted: PostedFinding }
  | { readonly kind: 'failed'; readonly failed: FailedFinding };

/**
 * `failedFinding`'s inputs bundled into one object: `finding` and `mode`
 * alone plus either `error` (a rejected `run`) or `stderr` (a resolved,
 * non-zero exit) would be a 4th positional parameter, over this repo's
 * 3-parameter limit (`local/max-function-params`).
 */
interface FailedFindingOptions {
  readonly finding: DeferredFinding;
  readonly mode: 'inline' | 'top-level';
  readonly error?: unknown;
  readonly stderr?: string;
}

/**
 * Posts a batch of deferred code-review findings to a PR — inline on the
 * diff line when possible, falling back to a top-level issue comment
 * otherwise (a line outside the diff, or GitHub rejecting the inline
 * attempt). Every finding is attempted independently: one failure never
 * aborts the rest, and `run` itself never throws to its caller.
 */
@Injectable()
export class PostDeferredFindingsService {
  constructor(
    private readonly processRunner: ProcessRunnerService,
    private readonly diffHunkMembership: DiffHunkMembershipService,
  ) {}

  async run(
    input: PostDeferredFindingsInput,
  ): Promise<PostDeferredFindingsResult> {
    const posted: PostedFinding[] = [];
    const failed: FailedFinding[] = [];
    if (input.findings.length === 0) {
      return { posted, failed };
    }

    const headSha = await this.resolveHeadSha(input.prNumber);

    // Sequential, not Promise.all: findings are posted in input order so
    // `posted`/`failed` preserve that order deterministically.
    for (const finding of input.findings) {
      const inDiff =
        headSha !== undefined &&
        (await this.diffHunkMembership.includesLine(
          finding.file,
          finding.line,
        ));

      if (inDiff) {
        const outcome = await this.postInline(input.prNumber, headSha, finding);
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

      const fallback = await this.postTopLevel(input.prNumber, finding);
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
   * just means every finding falls straight through to the top-level
   * fallback — surfacing findings beats surfacing nothing.
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
    finding: DeferredFinding,
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
          `path=${finding.file}`,
          '-f',
          'side=RIGHT',
          '-F',
          `line=${finding.line}`,
          '-f',
          `body=${this.inlineBody(finding.body)}`,
          '--jq',
          '.html_url',
        ],
        POST_TIMEOUT_MS,
      );
    } catch (error) {
      return {
        kind: 'failed',
        failed: this.failedFinding({ finding, mode: 'inline', error }),
      };
    }
    if (result.exitCode === 0) {
      return {
        kind: 'posted',
        posted: this.postedFinding(finding, 'inline', result.stdout),
      };
    }
    if (this.isHttp422(result)) {
      return { kind: 'fallback' };
    }
    return {
      kind: 'failed',
      failed: this.failedFinding({
        finding,
        mode: 'inline',
        stderr: result.stderr,
      }),
    };
  }

  private async postTopLevel(
    prNumber: string,
    finding: DeferredFinding,
  ): Promise<TopLevelOutcome> {
    let result: ProcessResult;
    try {
      result = await this.processRunner.run(
        'gh',
        [
          'api',
          `repos/{owner}/{repo}/issues/${prNumber}/comments`,
          '-f',
          `body=${this.topLevelBody(finding)}`,
          '--jq',
          '.html_url',
        ],
        POST_TIMEOUT_MS,
      );
    } catch (error) {
      return {
        kind: 'failed',
        failed: this.failedFinding({ finding, mode: 'top-level', error }),
      };
    }
    if (result.exitCode === 0) {
      return {
        kind: 'posted',
        posted: this.postedFinding(finding, 'top-level', result.stdout),
      };
    }
    return {
      kind: 'failed',
      failed: this.failedFinding({
        finding,
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
   * which finding this is about.
   */
  private topLevelBody(finding: DeferredFinding): string {
    return `${COMMENT_TAG}\n\n\`${finding.file}:${finding.line}\`\n\n${finding.body}`;
  }

  private postedFinding(
    finding: DeferredFinding,
    mode: 'inline' | 'top-level',
    stdout: string,
  ): PostedFinding {
    const url = stdout.trim();
    return {
      file: finding.file,
      line: finding.line,
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

  private failedFinding(options: FailedFindingOptions): FailedFinding {
    const { finding, mode, error, stderr } = options;
    return {
      file: finding.file,
      line: finding.line,
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
