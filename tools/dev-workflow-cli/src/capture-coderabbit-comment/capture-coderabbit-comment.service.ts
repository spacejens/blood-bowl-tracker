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
  /** How long to keep polling after the banner disappears. */
  readonly settleMs?: number;
}

/**
 * One distinct body of one CodeRabbit comment, as first seen. A body that
 * returns later after the comment changed in between is not recorded again.
 */
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
  /**
   * The banner was seen and the most recent successful poll found it gone;
   * false if it was never seen or had returned by the end.
   */
  readonly leftInProgress: boolean;
  readonly timedOut: boolean;
  readonly failedPolls: number;
  readonly observations: readonly CapturedCoderabbitBody[];
}

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 10_000;
const DEFAULT_SETTLE_MS = 30_000;
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
  /** When the first banner-free poll after an in-progress one happened. */
  settleStartedAt: number | undefined;
}

/**
 * Records every distinct body CodeRabbit's comments on a pull request go
 * through, so the in-progress layout of its rolling walkthrough comment can
 * be inspected from real data rather than assumed. Polls until a pass that
 * was seen in progress has been banner-free for the settle window (the
 * banner may go before the verdict is written), or until the timeout. A
 * failed `gh` call or unparseable output is counted and skipped, so one
 * transient error does not lose the bodies already captured.
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
    const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
    const state: CaptureState = {
      seen: new Set(),
      observations: [],
      failedPolls: 0,
      sawInProgress: false,
      settleStartedAt: undefined,
    };
    for (;;) {
      const inProgressNow = await this.poll(options.prNumber, state);
      if (this.hasSettled(inProgressNow, state, settleMs)) {
        return this.result(options.prNumber, state, false);
      }
      if (Date.now() >= deadline) {
        return this.result(options.prNumber, state, true);
      }
      await this.sleep(intervalMs);
    }
  }

  /** True once the banner has stayed away for `settleMs` after being seen. */
  private hasSettled(
    inProgressNow: boolean | undefined,
    state: CaptureState,
    settleMs: number,
  ): boolean {
    if (inProgressNow === true) {
      state.settleStartedAt = undefined;
    } else if (inProgressNow === false && state.sawInProgress) {
      state.settleStartedAt ??= Date.now();
    }
    return (
      state.settleStartedAt !== undefined &&
      Date.now() - state.settleStartedAt >= settleMs
    );
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

  /** Comments from one `gh` call; `undefined` if the call failed, was rejected or could not be parsed. */
  private async fetch(
    prNumber: string,
  ): Promise<CoderabbitComment[] | undefined> {
    let result: Awaited<ReturnType<ProcessRunnerService['run']>>;
    try {
      result = await this.processRunner.run(
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
    } catch {
      return undefined;
    }
    if (result.exitCode !== 0) {
      return undefined;
    }
    try {
      return result.stdout
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => coderabbitCommentSchema.parse(JSON.parse(line)));
    } catch {
      return undefined;
    }
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
      leftInProgress: state.settleStartedAt !== undefined,
      timedOut,
      failedPolls: state.failedPolls,
      observations: state.observations,
    };
  }

  private sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
