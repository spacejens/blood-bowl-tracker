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
  readonly timeoutMs?: number;
  readonly intervalMs?: number;
}

export interface WaitForPrReviewResult {
  readonly found: boolean;
  /** The first qualifying review; present only when `found` is true. */
  readonly review?: unknown;
  /** Present (and true) only when the wait ended on its timeout. */
  readonly timedOut?: boolean;
}

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
 */
@Injectable()
export class WaitForPrReviewService {
  constructor(private readonly processRunner: ProcessRunnerService) {}

  async run(options: WaitForPrReviewOptions): Promise<WaitForPrReviewResult> {
    const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    for (;;) {
      const review = await this.poll(options, deadline, intervalMs);
      if (review !== undefined) {
        return { found: true, review };
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
   */
  private async poll(
    options: WaitForPrReviewOptions,
    deadline: number,
    intervalMs: number,
  ): Promise<unknown> {
    const remainingMs = deadline - Date.now();
    const result = await this.processRunner.run(
      'gh',
      [
        'pr',
        'view',
        options.prNumber,
        '--json',
        'reviews',
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
    try {
      return JSON.parse(stdout) as unknown;
    } catch {
      return undefined;
    }
  }

  /**
   * Wrapped in `[...] | first` so a poll emits exactly one JSON value (the
   * first qualifying review, or `null`). A bare `.reviews[] | select(...)`
   * streams one document per match, which is not parseable as a whole when
   * more than one review qualifies.
   */
  private filter(options: WaitForPrReviewOptions): string {
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

  private sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
