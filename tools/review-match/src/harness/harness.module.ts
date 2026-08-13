import {
  REPORT_OUTPUT_PATH,
  ReportWriterService,
} from '@blood-bowl-tracker/review-harness';
import { Module } from '@nestjs/common';

import { ReviewMatchConfigService } from '../config/review-match-config.service';
import { MatchCategoryStratificationService } from '../match-events/match-category-stratification.service';
import { MatchEventStratificationService } from '../match-events/match-event-stratification.service';
import { MatchEventsModule } from '../match-events/match-events.module';
import { MatchEventsReviewerService } from '../match-events/match-events-reviewer.service';
import { MergedMatchStratificationService } from '../match-events/merged-match-stratification.service';
import { DATA_TYPE_REVIEWERS } from '../shared/data-type-reviewer';
import { MATCH_STRATIFIERS } from '../shared/match-stratifier';
import { SharedModule } from '../shared/shared.module';
import { MatchLookupService } from './match-lookup.service';
import { MatchResultLookupService } from './match-result-lookup.service';
import { MatchSamplerService } from './match-sampler.service';
import { ReportBuilderService } from './report-builder.service';
import { ReviewService } from './review.service';

/**
 * The data-type-agnostic half of the tool, plus the one place data types are
 * registered. NestJS has no multi-provider mechanism, so the two arrays below
 * are the registry: adding a future data type (rosters, standings) means
 * importing its module and adding it to these two factories — no change to any
 * harness service.
 */
@Module({
  imports: [SharedModule, MatchEventsModule],
  providers: [
    MatchLookupService,
    MatchResultLookupService,
    MatchSamplerService,
    ReportBuilderService,
    ReportWriterService,
    { provide: REPORT_OUTPUT_PATH, useExisting: ReviewMatchConfigService },
    ReviewService,
    {
      provide: DATA_TYPE_REVIEWERS,
      useFactory: (matchEvents: MatchEventsReviewerService) => [matchEvents],
      inject: [MatchEventsReviewerService],
    },
    {
      provide: MATCH_STRATIFIERS,
      useFactory: (
        matchEvents: MatchEventStratificationService,
        merged: MergedMatchStratificationService,
        category: MatchCategoryStratificationService,
      ) => [matchEvents, merged, category],
      inject: [
        MatchEventStratificationService,
        MergedMatchStratificationService,
        MatchCategoryStratificationService,
      ],
    },
  ],
  exports: [ReviewService],
})
export class HarnessModule {}
