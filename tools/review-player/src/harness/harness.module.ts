import {
  createRegistryProvider,
  REPORT_OUTPUT_PATH,
  ReportWriterService,
} from '@blood-bowl-tracker/review-harness';
import { Module } from '@nestjs/common';

import { ReviewPlayerConfigService } from '../config/review-player-config.service';
import { PlayerInfoModule } from '../player-info/player-info.module';
import { PlayerInfoReviewerService } from '../player-info/player-info-reviewer.service';
import { RandomPlayerStratificationService } from '../player-info/random-player-stratification.service';
import { StarPlayerStratificationService } from '../player-info/star-player-stratification.service';
import { PLAYER_DATA_TYPE_REVIEWERS } from '../shared/data-type-reviewer';
import { PLAYER_STRATIFIERS } from '../shared/player-stratifier';
import { SharedModule } from '../shared/shared.module';
import { PlayerSppTotalsReviewerService } from '../spp-totals/player-spp-totals-reviewer.service';
import { SppDiscrepancyStratificationService } from '../spp-totals/spp-discrepancy-stratification.service';
import { SppTotalsModule } from '../spp-totals/spp-totals.module';
import { PlayerLookupService } from './player-lookup.service';
import { PlayerSamplerService } from './player-sampler.service';
import { ReportBuilderService } from './report-builder.service';
import { ReviewService } from './review.service';

/**
 * The data-type-agnostic half of the tool, plus the one place data types are
 * registered. NestJS has no multi-provider mechanism, so the two arrays below
 * are the registry: adding a future data type (skills, injuries,
 * characteristics) means importing its module and adding it to these two
 * factories — no change to any harness service.
 */
@Module({
  imports: [SharedModule, PlayerInfoModule, SppTotalsModule],
  providers: [
    PlayerLookupService,
    PlayerSamplerService,
    ReportBuilderService,
    ReportWriterService,
    { provide: REPORT_OUTPUT_PATH, useExisting: ReviewPlayerConfigService },
    ReviewService,
    createRegistryProvider(PLAYER_DATA_TYPE_REVIEWERS, [
      PlayerInfoReviewerService,
      PlayerSppTotalsReviewerService,
    ]),
    createRegistryProvider(PLAYER_STRATIFIERS, [
      SppDiscrepancyStratificationService,
      RandomPlayerStratificationService,
      StarPlayerStratificationService,
    ]),
  ],
  exports: [ReviewService],
})
export class HarnessModule {}
