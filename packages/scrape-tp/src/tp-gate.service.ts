import { Injectable } from '@nestjs/common';

import { TpBlockedError } from './tp-blocked.error';

/** Bounds of the random gap between two requests to TP. */
const MIN_DELAY_MS = 500;
const MAX_DELAY_MS = 2000;

/**
 * How long TP is left alone after the first, second and third 403 in a row;
 * every further one repeats the last value.
 */
const BACKOFF_MS: readonly number[] = [5 * 60_000, 15 * 60_000, 60 * 60_000];

/**
 * The one gate every request to TP in the process passes through, whichever
 * session makes it. A singleton, so independent imports running side by side
 * never burst TP in parallel:
 *
 * - **Queue.** Requests run one at a time, in the order they were handed in.
 * - **Pacing.** Each waits until a random 0.5–2 s have passed since the
 *   previous request finished; time already spent counts. Only the first
 *   request the process makes is not delayed.
 * - **Back-off.** After {@link block} (TP answered 403), every request fails
 *   at once with {@link TpBlockedError} (its `answeredByTp` false), without
 *   being run, until the back-off ends. The back-off grows with each block
 *   in a row and {@link succeeded} resets it.
 */
@Injectable()
export class TpGateService {
  private tail: Promise<unknown> = Promise.resolve();
  private lastRequestAt: number | undefined;
  private blockedUntil: number | undefined;
  private blocksInARow = 0;

  /**
   * Runs `request` in its turn, once it is paced, and settles with its
   * outcome. Rejects with {@link TpBlockedError}, without running it, while
   * a back-off is in force. One request failing never stops the queue.
   */
  run<T>(request: () => Promise<T>): Promise<T> {
    const turn = this.tail.then(() => this.take(request));
    this.tail = turn.catch(() => undefined);
    return turn;
  }

  /**
   * Records that TP answered 403: starts (or extends) the back-off, and
   * returns the error for the caller to throw.
   */
  block(): TpBlockedError {
    const backoff =
      BACKOFF_MS[Math.min(this.blocksInARow, BACKOFF_MS.length - 1)];
    this.blocksInARow += 1;
    this.blockedUntil = Date.now() + backoff;
    return new TpBlockedError(new Date(this.blockedUntil));
  }

  /** Records a successful response: the next block backs off from the start. */
  succeeded(): void {
    this.blocksInARow = 0;
  }

  private async take<T>(request: () => Promise<T>): Promise<T> {
    if (this.blockedUntil !== undefined && Date.now() < this.blockedUntil) {
      throw new TpBlockedError(new Date(this.blockedUntil), {
        answeredByTp: false,
      });
    }
    await this.waitForPacing();
    try {
      return await request();
    } finally {
      this.lastRequestAt = Date.now();
    }
  }

  private async waitForPacing(): Promise<void> {
    if (this.lastRequestAt === undefined) {
      return;
    }
    const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
    const remaining = this.lastRequestAt + delay - Date.now();
    if (remaining > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, remaining));
    }
  }
}
