import type { TpMatchImportResult } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

/**
 * Decides whether one match's events were attempted and imported without
 * error. A skipped events stage reports an empty, successful result, so
 * success alone cannot tell it from a completed one.
 */
@Injectable()
export class TpMatchEventsImportedService {
  /**
   * Whether the match's events were imported: the match row was written,
   * participation was linked (the events stage is only attempted then) and
   * the events stage reported no errors. A failed team import leaves the
   * match row unwritten, so it does not hold either.
   */
  eventsImported({
    match,
    participation,
    events,
  }: Pick<TpMatchImportResult, 'match' | 'participation' | 'events'>): boolean {
    return (
      match.imported > 0 &&
      participation.imported > 0 &&
      events.errors.length === 0
    );
  }
}
