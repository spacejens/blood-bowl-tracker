import { Injectable } from '@nestjs/common';

import { AcquireReviewLockOptions } from './review-lock.service';

export const REVIEW_LOCK_USAGE =
  'Usage: node dist/main.js ' +
  '<acquire-review-lock|heartbeat-review-lock|release-review-lock> ' +
  '<holder-id> [--timeout-ms=<ms>] [--interval-ms=<ms>]';

/** Below this, `--interval-ms` would spin on the state file in a tight loop. */
const MIN_INTERVAL_MS = 1000;

/** The only flags this parser understands. */
const KNOWN_FLAG_PREFIXES = ['--timeout-ms=', '--interval-ms='] as const;

/**
 * Turns the review-lock subcommands' argv into their options object. Split
 * out of `main.ts` so the flag parsing and its validation are unit-testable —
 * argv comes in as a parameter rather than being read from `process` here.
 * All three subcommands share this parser; `heartbeat`/`release` simply use
 * `holderId` alone and ignore the flags.
 */
@Injectable()
export class ReviewLockArgsService {
  parse(argv: readonly string[]): AcquireReviewLockOptions {
    const holderId = argv[3];
    if (
      holderId === undefined ||
      holderId.trim() === '' ||
      holderId.startsWith('--')
    ) {
      throw new Error(REVIEW_LOCK_USAGE);
    }
    const flags = argv.slice(4);
    const unknownFlag = flags.find(
      (arg) => !KNOWN_FLAG_PREFIXES.some((prefix) => arg.startsWith(prefix)),
    );
    if (unknownFlag !== undefined) {
      throw new Error(`${REVIEW_LOCK_USAGE} (unknown flag: ${unknownFlag})`);
    }
    const timeoutMs = this.readIntFlag(flags, 'timeout-ms', 0);
    const intervalMs = this.readIntFlag(flags, 'interval-ms', MIN_INTERVAL_MS);
    return {
      holderId,
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
      ...(intervalMs === undefined ? {} : { intervalMs }),
    };
  }

  /** Reads `--<name>=<integer>`; undefined when the flag is absent. */
  private readIntFlag(
    flags: readonly string[],
    name: string,
    minimum: number,
  ): number | undefined {
    const prefix = `--${name}=`;
    const flag = flags.find((arg) => arg.startsWith(prefix));
    if (flag === undefined) {
      return undefined;
    }
    const rawValue = flag.slice(prefix.length);
    if (rawValue.trim() === '') {
      throw new Error(`${REVIEW_LOCK_USAGE} (bad --${name} value)`);
    }
    const value = Number(rawValue);
    if (!Number.isInteger(value) || value < minimum) {
      throw new Error(`${REVIEW_LOCK_USAGE} (bad --${name} value)`);
    }
    return value;
  }
}
