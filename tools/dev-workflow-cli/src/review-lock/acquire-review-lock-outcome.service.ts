import { Injectable } from '@nestjs/common';

/** The one subcommand whose dispatch persists a new lock holder. */
const ACQUIRE_SUBCOMMAND = 'acquire-review-lock';

/**
 * Reads a finished dispatch's subcommand and result to answer one question:
 * did this run leave the review lock held on disk? `acquire` writes the new
 * holder before it resolves, so a failure that happens after dispatch — the
 * Nest context failing to close, say — would otherwise strand the lock as
 * held until its staleness window expires.
 */
@Injectable()
export class AcquireReviewLockOutcomeService {
  wasSuccessfulAcquire(subcommand: string, result: unknown): boolean {
    return (
      subcommand === ACQUIRE_SUBCOMMAND &&
      typeof result === 'object' &&
      result !== null &&
      'acquired' in result &&
      result.acquired === true
    );
  }
}
