import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Module } from '@nestjs/common';

import { ExternalSystemLookupService } from './external-system-lookup.service';
import { StarPlayerExternalIdsService } from './star-player-external-ids.service';
import { StarPlayerNameMatcherService } from './star-player-name-matcher.service';
import { StarPlayerPositionsQueryService } from './star-player-positions-query.service';

/**
 * Cross-cutting services both the harness and every data-type module use.
 * Keeping them here (rather than in the harness) is what lets the harness
 * import data-type modules without a cycle. `HtmlService` comes from
 * `@blood-bowl-tracker/review-harness`; it is still provided here so every
 * data-type module injects it through this one module.
 */
const SHARED = [
  ExternalSystemLookupService,
  HtmlService,
  StarPlayerExternalIdsService,
  StarPlayerNameMatcherService,
  StarPlayerPositionsQueryService,
];

@Module({
  providers: SHARED,
  exports: SHARED,
})
export class SharedModule {}
