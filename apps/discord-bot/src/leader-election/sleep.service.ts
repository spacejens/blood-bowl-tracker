import { Injectable } from '@nestjs/common';

/**
 * Injectable wrapper around a timer-based delay, so the leader-election retry
 * loop can be driven directly in tests instead of through fake timers.
 */
@Injectable()
export class SleepService {
  sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
