import { Injectable } from '@nestjs/common';

/**
 * Renders a whole-day count for leaderboard rows, e.g. `1 day` / `91 days`.
 * Mirrors the `gp` money rendering used by the expensive-mistakes toplists,
 * but lives in a service because all logic in this app does.
 */
@Injectable()
export class DayCountFormatterService {
  format(days: number): string {
    const suffix = days === 1 ? 'day' : 'days';
    return `${days.toLocaleString('en-US')} ${suffix}`;
  }
}
