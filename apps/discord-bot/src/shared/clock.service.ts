import { Injectable } from '@nestjs/common';

/**
 * The one place wall-clock time enters the bot. All other code that depends
 * on the current time receives it through this service, so that specs can stub
 * a single collaborator rather than fake timers everywhere (mirroring
 * RandomSourceService's rationale for randomness).
 */
@Injectable()
export class ClockService {
  /**
   * Returns the current wall-clock time.
   */
  now(): Date {
    return new Date();
  }
}
