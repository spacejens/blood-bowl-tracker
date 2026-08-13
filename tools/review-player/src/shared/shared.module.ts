import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Module } from '@nestjs/common';

import { ExternalSystemLookupService } from './external-system-lookup.service';
import { PlayerProjectionQueryService } from './player-projection-query.service';

/**
 * Cross-cutting services both the harness and every data-type module use.
 * Keeping them here (rather than in the harness) is what lets the harness
 * import data-type modules without a cycle. `HtmlService` comes from
 * `@blood-bowl-tracker/review-harness`; it is still provided here so the rest
 * of the tool injects it exactly as before.
 */
@Module({
  providers: [
    ExternalSystemLookupService,
    HtmlService,
    PlayerProjectionQueryService,
  ],
  exports: [
    ExternalSystemLookupService,
    HtmlService,
    PlayerProjectionQueryService,
  ],
})
export class SharedModule {}
