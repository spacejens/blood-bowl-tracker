import { Injectable } from '@nestjs/common';

import {
  ReviewLockHolder,
  ReviewLockMutation,
  ReviewLockQueueEntry,
  ReviewLockState,
  ReviewLockStateService,
} from './review-lock-state.service';

/** Why a heartbeat was rejected — the only reason there is. */
export const NOT_CURRENT_HOLDER = 'not the current holder';

/** Matches `wait-for-pr-review`'s own poll gap; skills document both as 30s. */
export const REVIEW_LOCK_DEFAULT_INTERVAL_MS = 30_000;
/**
 * 100 minutes. Comfortably longer than the longest normal gap between two
 * heartbeat checkpoints: `develop-feature`'s Phase 6 loop step (b2)'s
 * short-wait rate-limit branch can hold the lock through a
 * `wait-for-pr-review` wait of up to ~60 minutes (the rate limit's own
 * reported wait, capped below the 1-hour auto-continue threshold) plus a
 * 20-minute post-trigger review window right after it — up to ~80 minutes
 * with zero heartbeats in between — yet still short enough that a crashed
 * session's lock is recovered well within an unattended overnight run.
 */
export const REVIEW_LOCK_STALE_MS = 6_000_000;

export interface AcquireReviewLockOptions {
  readonly holderId: string;
  /**
   * Absent means "wait however long it takes" — the intended use. Waiting
   * quietly costs nothing; competing for the review quota costs every
   * session's progress.
   */
  readonly timeoutMs?: number;
  readonly intervalMs?: number;
}

export interface AcquireReviewLockResult {
  readonly acquired: boolean;
  /** Present only when `acquired` is true. */
  readonly waitedMs?: number;
  /** Present (and true) only when the wait ended on its timeout. */
  readonly timedOut?: boolean;
}

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
   * Joins the queue if not already in it, then polls until this session is at
   * the front of the queue and the lock is free — either unheld, or held by a
   * session whose heartbeat has gone stale, which reclaims a lock left behind
   * by a crash. On a timeout the caller's ticket is deliberately left in the
   * queue: it keeps its place for a later retry.
   */
  async acquire(
    options: AcquireReviewLockOptions,
  ): Promise<AcquireReviewLockResult> {
    const intervalMs = options.intervalMs ?? REVIEW_LOCK_DEFAULT_INTERVAL_MS;
    const start = Date.now();
    const deadline =
      options.timeoutMs === undefined ? undefined : start + options.timeoutMs;
    for (;;) {
      const acquired = await this.state.mutate((state) =>
        this.tryAcquire(state, options.holderId),
      );
      if (acquired) {
        return { acquired: true, waitedMs: Date.now() - start };
      }
      if (deadline !== undefined && Date.now() >= deadline) {
        return { acquired: false, timedOut: true };
      }
      await this.sleep(intervalMs);
      // `sleep` can resume at or past the deadline even though the check
      // above passed just before it started (timer drift, a busy event
      // loop) — re-check so a late wake-up cannot run one more attempt
      // after the caller's own timeout already elapsed.
      if (deadline !== undefined && Date.now() >= deadline) {
        return { acquired: false, timedOut: true };
      }
    }
  }

  /**
   * One attempt, as a pure transition. Ordering matters: an id that already
   * holds the lock is answered before anything is enqueued, so a re-invoked
   * acquire (develop-feature re-acquiring after a heartbeat mismatch, say) is
   * an idempotent heartbeat refresh rather than a duplicate ticket.
   */
  private tryAcquire(
    state: ReviewLockState,
    holderId: string,
  ): ReviewLockMutation<boolean> {
    const now = this.now();
    if (state.holder?.id === holderId) {
      return {
        state: {
          holder: { ...state.holder, heartbeatAt: now },
          queue: state.queue,
        },
        result: true,
      };
    }
    const queue = this.liveQueue(state.queue, holderId, now);
    if (queue[0]?.id !== holderId || !this.isFree(state.holder, now)) {
      return { state: { holder: state.holder, queue }, result: false };
    }
    return {
      state: {
        holder: { id: holderId, acquiredAt: now, heartbeatAt: now },
        queue: queue.slice(1),
      },
      result: true,
    };
  }

  /**
   * This session's own ticket, refreshed to `now` (proof of life — its
   * staleness clock resets on every poll, but its position in the array,
   * which is what encodes FIFO order, is untouched), plus every other entry
   * that has not gone stale. A queue entry nobody is polling for anymore (the
   * session behind it was killed while waiting) would otherwise block every
   * session behind it forever, since only the front of the queue may ever
   * acquire.
   */
  private liveQueue(
    queue: readonly ReviewLockQueueEntry[],
    holderId: string,
    now: string,
  ): readonly ReviewLockQueueEntry[] {
    const withSelf = queue.some((entry) => entry.id === holderId)
      ? queue.map((entry) =>
          entry.id === holderId ? { id: holderId, enqueuedAt: now } : entry,
        )
      : [...queue, { id: holderId, enqueuedAt: now }];
    return withSelf.filter(
      (entry) => entry.id === holderId || !this.isStale(entry.enqueuedAt, now),
    );
  }

  /** An unparseable timestamp counts as stale — it can never be judged alive. */
  private isStale(timestamp: string, now: string): boolean {
    const ms = new Date(timestamp).getTime();
    if (Number.isNaN(ms)) {
      return true;
    }
    return new Date(now).getTime() - ms > REVIEW_LOCK_STALE_MS;
  }

  private isFree(holder: ReviewLockHolder | null, now: string): boolean {
    return holder === null || this.isStale(holder.heartbeatAt, now);
  }

  private sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

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
