import { Injectable } from '@nestjs/common';

import { WaitForPrReviewOptions } from './wait-for-pr-review.service';

const WAIT_FOR_PR_REVIEW_USAGE =
  'Usage: node dist/main.js wait-for-pr-review <pr-number> ' +
  '<developer-login> <since-epoch-seconds> ' +
  '[--timeout-ms=600000] [--interval-ms=30000] [--exclude-review-id=<id>] ' +
  '[--exclude-comment-id=<id>] [--exclude-comment-update-failure-id=<id>] ' +
  '[--trigger-after=<epoch-seconds>]';

/** Below this, `--interval-ms` would hammer `gh` in a tight loop. */
const MIN_INTERVAL_MS = 1000;

/** An epoch second is always positive, so 0 (what an empty value parses to) is a typo, not a request to trigger now. */
const MIN_TRIGGER_AFTER_EPOCH_SECONDS = 1;

/**
 * Turns `wait-for-pr-review`'s argv into its options object. Split out of
 * `main.ts` so the flag parsing and its validation are unit-testable — argv
 * comes in as a parameter rather than being read from `process` here.
 */
@Injectable()
export class WaitForPrReviewArgsService {
  parse(argv: readonly string[]): WaitForPrReviewOptions {
    const prNumber = argv[3];
    const developerLogin = argv[4];
    const sinceEpochSecondsRaw = argv[5];
    const sinceEpochSeconds = Number(sinceEpochSecondsRaw);
    if (
      prNumber === undefined ||
      !/^[1-9]\d*$/.test(prNumber) ||
      developerLogin === undefined ||
      developerLogin === '' ||
      sinceEpochSecondsRaw === undefined ||
      sinceEpochSecondsRaw === '' ||
      !Number.isInteger(sinceEpochSeconds)
    ) {
      throw new Error(WAIT_FOR_PR_REVIEW_USAGE);
    }
    const flags = argv.slice(6);
    const excludeReviewId = this.readFlag(flags, 'exclude-review-id');
    const excludeCommentId = this.readFlag(flags, 'exclude-comment-id');
    const excludeCommentUpdateFailureId = this.readFlag(
      flags,
      'exclude-comment-update-failure-id',
    );
    const triggerAfterEpochSeconds = this.readIntFlag(
      flags,
      'trigger-after',
      MIN_TRIGGER_AFTER_EPOCH_SECONDS,
    );
    return {
      prNumber,
      developerLogin,
      sinceEpochSeconds,
      timeoutMs: this.readIntFlag(flags, 'timeout-ms', 0),
      intervalMs: this.readIntFlag(flags, 'interval-ms', MIN_INTERVAL_MS),
      ...(excludeReviewId === undefined ? {} : { excludeReviewId }),
      ...(excludeCommentId === undefined ? {} : { excludeCommentId }),
      ...(excludeCommentUpdateFailureId === undefined
        ? {}
        : { excludeCommentUpdateFailureId }),
      ...(triggerAfterEpochSeconds === undefined
        ? {}
        : { triggerAfterEpochSeconds }),
    };
  }

  /** Reads `--<name>=<value>` from the flags region of argv; undefined when absent. */
  private readFlag(flags: readonly string[], name: string): string | undefined {
    const prefix = `--${name}=`;
    const flag = flags.find((arg) => arg.startsWith(prefix));
    return flag === undefined ? undefined : flag.slice(prefix.length);
  }

  /** Reads `--<name>=<integer>`; undefined when the flag is absent. */
  private readIntFlag(
    flags: readonly string[],
    name: string,
    minimum: number,
  ): number | undefined {
    const raw = this.readFlag(flags, name);
    if (raw === undefined) {
      return undefined;
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < minimum) {
      throw new Error(`${WAIT_FOR_PR_REVIEW_USAGE} (bad --${name} value)`);
    }
    return value;
  }
}
