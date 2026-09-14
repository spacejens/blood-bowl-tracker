import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { ExternalSystemLookupService } from './external-system-lookup.service';
import { StarPlayerExternalIdsService } from './star-player-external-ids.service';
import { StarPlayerNameMatcherService } from './star-player-name-matcher.service';
import { StarPlayerPositionsQueryService } from './star-player-positions-query.service';
import { StarSourceLookupService } from './star-source-lookup.service';

/**
 * Cross-cutting services both the harness and every data-type module use.
 * Keeping them here (rather than in the harness) is what lets the harness
 * import data-type modules without a cycle. `HtmlService` comes from
 * `@blood-bowl-tracker/review-harness`; it is still provided here so every
 * data-type module injects it through this one module.
 *
 * Imports `SourceModule` for `StarSourceLookupService`'s own dependency on
 * BBL's and TP's raw source services. That import runs one way only:
 * `SourceModule` does not import `SharedModule` back (its two raw services
 * that need `StarPlayerNameMatcherService` register their own copy of that
 * stateless, dependency-free class instead — see `SourceModule`), so no
 * module-import cycle exists between the two.
 */
const SHARED = [
  ExternalSystemLookupService,
  HtmlService,
  StarPlayerExternalIdsService,
  StarPlayerNameMatcherService,
  StarPlayerPositionsQueryService,
  StarSourceLookupService,
];

@Module({
  imports: [SourceModule],
  providers: SHARED,
  exports: SHARED,
})
export class SharedModule {}
