import { Injectable } from '@nestjs/common';

/**
 * The one place randomness enters the scheduled-insights code, so specs can
 * stub a single collaborator instead of patching `Math.random` in every test
 * of every service that makes a random choice.
 */
@Injectable()
export class RandomSourceService {
  /** A float in [0, 1). */
  next(): number {
    return Math.random();
  }

  /**
   * True with the given probability, expressed as an integer percentage.
   * 0 never returns true and 100 always does, because `next()` never reaches 1.
   */
  rollPercent(percent: number): boolean {
    return this.next() * 100 < percent;
  }

  /** One uniformly chosen element. The caller must pass a non-empty array. */
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }
}
