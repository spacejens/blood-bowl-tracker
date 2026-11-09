import { ProcessRunnerService } from '@blood-bowl-tracker/cli-shared';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import {
  CoderabbitCommentLayout,
  CoderabbitCommentLayoutService,
} from './coderabbit-comment-layout.service';

export interface CaptureCoderabbitCommentOptions {
  readonly prNumber: string;
  readonly timeoutMs?: number;
  readonly intervalMs?: number;
}

/** One distinct body of one CodeRabbit comment, as first seen. */
export interface CapturedCoderabbitBody {
  readonly commentId: number;
  readonly updatedAt: string;
  readonly observedAt: string;
  readonly layout: CoderabbitCommentLayout;
  readonly body: string;
}

export interface CaptureCoderabbitCommentResult {
  readonly prNumber: string;
  /** Some poll found a CodeRabbit comment showing the processing banner. */
  readonly sawInProgress: boolean;
  /** A later successful poll found no CodeRabbit comment showing it. */
  readonly leftInProgress: boolean;
  readonly timedOut: boolean;
  readonly failedPolls: number;
  readonly observations: readonly CapturedCoderabbitBody[];
}

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 10_000;
const GH_CALL_TIMEOUT_MS = 60_000;

/**
 * One JSON object per line per CodeRabbit-authored comment. `tojson` keeps a
 * multi-line body on one line, so `--paginate`'s per-page output concatenates
 * into plain line-delimited JSON. The login match is the same
 * case-insensitive substring test every CodeRabbit check in this CLI uses.
 */
export const CODERABBIT_COMMENTS_JQ =
  '.[] | select((.user.login // "") | test("coderabbit"; "i")) | ' +
  '{id: .id, updatedAt: (.updated_at // ""), body: (.body // "")} | tojson';

const coderabbitCommentSchema = z.object({
  id: z.number().int(),
  updatedAt: z.string(),
  body: z.string(),
});

type CoderabbitComment = z.infer<typeof coderabbitCommentSchema>;

interface CaptureState {
  readonly seen: Set<string>;
  readonly observations: CapturedCoderabbitBody[];
  failedPolls: number;
  sawInProgress: boolean;
}

/**
 * Records every distinct body CodeRabbit's comments on a pull request go
 * through, so the in-progress layout of its rolling walkthrough comment can
 * be inspected from real data rather than assumed. Polls until a pass that
 * was seen in progress has finished, or until the timeout. A failed `gh`
 * call is counted and skipped, so one transient error does not lose the
 * bodies already captured.
 */
@Injectable()
export class CaptureCoderabbitCommentService {
  constructor(
    private readonly processRunner: ProcessRunnerService,
    private readonly layout: CoderabbitCommentLayoutService,
  ) {}

  async run(
    options: CaptureCoderabbitCommentOptions,
  ): Promise<CaptureCoderabbitCommentResult> {
    const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    const state: CaptureState = {
      seen: new Set(),
      observations: [],
      failedPolls: 0,
      sawInProgress: false,
    };
    for (;;) {
      const inProgressNow = await this.poll(options.prNumber, state);
      if (inProgressNow === false && state.sawInProgress) {
        return this.result(options.prNumber, state, false);
      }
      if (Date.now() >= deadline) {
        return this.result(options.prNumber, state, true);
      }
      await this.sleep(intervalMs);
    }
  }

  /** Whether any CodeRabbit comment shows the banner; `undefined` if `gh` failed. */
  private async poll(
    prNumber: string,
    state: CaptureState,
  ): Promise<boolean | undefined> {
    const comments = await this.fetch(prNumber);
    if (comments === undefined) {
      state.failedPolls += 1;
      return undefined;
    }
    let inProgressNow = false;
    for (const comment of comments) {
      const layout = this.layout.describe(comment.body);
      inProgressNow ||= layout.processingBanner;
      this.record(comment, layout, state);
    }
    if (inProgressNow) {
      state.sawInProgress = true;
    }
    return inProgressNow;
  }

  private async fetch(
    prNumber: string,
  ): Promise<CoderabbitComment[] | undefined> {
    const result = await this.processRunner.run(
      'gh',
      [
        'api',
        `repos/{owner}/{repo}/issues/${prNumber}/comments`,
        '--paginate',
        '--jq',
        CODERABBIT_COMMENTS_JQ,
      ],
      GH_CALL_TIMEOUT_MS,
    );
    if (result.exitCode !== 0) {
      return undefined;
    }
    return result.stdout
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => coderabbitCommentSchema.parse(JSON.parse(line)));
  }

  private record(
    comment: CoderabbitComment,
    layout: CoderabbitCommentLayout,
    state: CaptureState,
  ): void {
    const key = `${comment.id}\u0000${comment.body}`;
    if (state.seen.has(key)) {
      return;
    }
    state.seen.add(key);
    state.observations.push({
      commentId: comment.id,
      updatedAt: comment.updatedAt,
      observedAt: new Date().toISOString(),
      layout,
      body: comment.body,
    });
  }

  private result(
    prNumber: string,
    state: CaptureState,
    timedOut: boolean,
  ): CaptureCoderabbitCommentResult {
    return {
      prNumber,
      sawInProgress: state.sawInProgress,
      leftInProgress: !timedOut,
      timedOut,
      failedPolls: state.failedPolls,
      observations: state.observations,
    };
  }

  private sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
