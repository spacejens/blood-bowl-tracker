import { Injectable } from '@nestjs/common';

import {
  ReviewLockMutation,
  ReviewLockState,
  ReviewLockStateService,
} from './review-lock-state.service';

/** Why a heartbeat was rejected — the only reason there is. */
export const NOT_CURRENT_HOLDER = 'not the current holder';

export interface HeartbeatReviewLockResult {
  readonly ok: boolean;
  /** Present only when `ok` is false. */
  readonly reason?: string;
}

export interface ReleaseReviewLockResult {
  /**
   * False when the id was neither holding nor queued — a stale double
   * release, which is a normal outcome (a Skip branch may already have
   * released), not an error.
   */
  readonly released: boolean;
}

/**
 * The review lock's policy: who may hold it, when a dead holder's lock may
 * be reclaimed, and how sessions queue for their turn. Every decision here
 * is a pure state transition handed to `ReviewLockStateService.mutate`,
 * which is what makes it safe against other CLI processes racing it.
 */
@Injectable()
export class ReviewLockService {
  constructor(private readonly state: ReviewLockStateService) {}

  /**
   * Refreshes the holder's `heartbeatAt` so no other session reclaims the
   * lock as stale. A mismatch means this session's lock is already gone —
   * the caller must re-acquire before triggering another review.
   */
  async heartbeat(holderId: string): Promise<HeartbeatReviewLockResult> {
    return this.state.mutate(
      (state): ReviewLockMutation<HeartbeatReviewLockResult> =>
        state.holder?.id === holderId
          ? {
              state: {
                holder: { ...state.holder, heartbeatAt: this.now() },
                queue: state.queue,
              },
              result: { ok: true },
            }
          : { state, result: { ok: false, reason: NOT_CURRENT_HOLDER } },
    );
  }

  /**
   * Hands the lock to whoever is next, or drops this session's queue ticket
   * when it was only waiting (e.g. abandoning a wait at a Pause).
   */
  async release(holderId: string): Promise<ReleaseReviewLockResult> {
    return this.state.mutate((state) => this.releaseFrom(state, holderId));
  }

  private releaseFrom(
    state: ReviewLockState,
    holderId: string,
  ): ReviewLockMutation<ReleaseReviewLockResult> {
    if (state.holder?.id === holderId) {
      return {
        state: { holder: null, queue: state.queue },
        result: { released: true },
      };
    }
    if (state.queue.some((entry) => entry.id === holderId)) {
      return {
        state: {
          holder: state.holder,
          queue: state.queue.filter((entry) => entry.id !== holderId),
        },
        result: { released: true },
      };
    }
    return { state, result: { released: false } };
  }

  private now(): string {
    return new Date().toISOString();
  }
}
