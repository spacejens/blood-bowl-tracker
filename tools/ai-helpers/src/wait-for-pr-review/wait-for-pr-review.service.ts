import { Injectable } from '@nestjs/common';

import { ProcessRunnerService } from '../shared/process-runner.service';

/** One wait's inputs; the optional fields fall back to the defaults below. */
export interface WaitForPrReviewOptions {
  readonly prNumber: string;
  /** The PR author's own login — their own reviews never qualify. */
  readonly developerLogin: string;
  /** Only reviews submitted strictly after this instant qualify. */
  readonly sinceEpochSeconds: number;
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
      const review = await this.poll(options);
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
   * One `gh` query. Returns the first qualifying review, or `undefined` when
   * there is none *or* the call did not produce usable output — a transient
   * `gh` failure is a reason to retry on the next interval, never to abort
   * the wait.
   */
  private async poll(options: WaitForPrReviewOptions): Promise<unknown> {
    const result = await this.processRunner.run('gh', [
      'pr',
      'view',
      options.prNumber,
      '--json',
      'reviews',
      '--jq',
      this.filter(options),
    ]);
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
    return (
      '[.reviews[] | select(.submittedAt != null) | ' +
      `select(.author.login != ${login} and ` +
      `(.submittedAt | fromdateiso8601) > ${options.sinceEpochSeconds})] | first`
    );
  }

  private sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
