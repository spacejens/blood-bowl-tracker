import { Injectable } from '@nestjs/common';

/**
 * The one place the official team list import reads the time, so specs stub
 * one collaborator instead of faking timers. Monotonic: only the difference
 * between two readings means anything.
 */
@Injectable()
export class MonotonicClockService {
  /** Milliseconds since an arbitrary fixed origin. */
  nowMs(): number {
    return performance.now();
  }
}
