import { Injectable } from '@nestjs/common';

import { AcquireReviewLockOutcomeService } from './acquire-review-lock-outcome.service';
import { ReviewLockService } from './review-lock.service';
import { ReviewLockArgsService } from './review-lock-args.service';

/**
 * Best-effort release of a lock that `acquire-review-lock` took but whose
 * caller could not confirm cleanly, because something after dispatch (e.g.
 * `app.close()`) then failed. Holds the actual decision and orchestration so
 * it can be unit tested independently of the fresh application context its
 * caller bootstraps to run it in.
 */
@Injectable()
export class AcquireReviewLockCleanupService {
  constructor(
    private readonly outcome: AcquireReviewLockOutcomeService,
    private readonly args: ReviewLockArgsService,
    private readonly lock: ReviewLockService,
  ) {}

  async releaseIfAcquired(
    subcommand: string,
    result: unknown,
    argv: readonly string[],
  ): Promise<void> {
    if (!this.outcome.wasSuccessfulAcquire(subcommand, result)) {
      return;
    }
    const { holderId } = this.args.parse(argv);
    await this.lock.release(holderId);
  }
}
