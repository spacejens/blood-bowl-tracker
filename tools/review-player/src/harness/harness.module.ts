import {
  createRegistryProvider,
  REPORT_OUTPUT_PATH,
  ReportWriterService,
} from '@blood-bowl-tracker/review-harness';
import { Module } from '@nestjs/common';

import { AdvancementCostsModule } from '../advancement-costs/advancement-costs.module';
import { UnspentSppOutsideRangeStratificationService } from '../advancement-costs/unspent-spp-outside-range-stratification.service';
import { CareerHistoryModule } from '../career-history/career-history.module';
import { PlayerCareerHistoryReviewerService } from '../career-history/player-career-history-reviewer.service';
import { ReviewPlayerConfigService } from '../config/review-player-config.service';
import { CurrentInjuryStratificationService } from '../lasting-injuries/current-injury-stratification.service';
import { HealedInjuryStratificationService } from '../lasting-injuries/healed-injury-stratification.service';
import { LastingInjuriesModule } from '../lasting-injuries/lasting-injuries.module';
import { OverviewModule } from '../overview/overview.module';
import { PlayerOverviewReviewerService } from '../overview/player-overview-reviewer.service';
import { PlayerAdvancementsModule } from '../player-advancements/player-advancements.module';
import { PlayerAdvancementsStratificationService } from '../player-advancements/player-advancements-stratification.service';
import { CharacteristicsChangeStratificationService } from '../player-characteristics/characteristics-change-stratification.service';
import { PlayerCharacteristicsModule } from '../player-characteristics/player-characteristics.module';
import { JourneymanStratificationService } from '../player-info/journeyman-stratification.service';
import { PlayerInfoModule } from '../player-info/player-info.module';
import { RandomPlayerStratificationService } from '../player-info/random-player-stratification.service';
import { StarPlayerStratificationService } from '../player-info/star-player-stratification.service';
import { PlayerKeywordsModule } from '../player-keywords/player-keywords.module';
import { PlayerKeywordsStratificationService } from '../player-keywords/player-keywords-stratification.service';
import { PlayerStatusModule } from '../player-status/player-status.module';
import { PlayerStatusStratificationService } from '../player-status/player-status-stratification.service';
import { PLAYER_DATA_TYPE_REVIEWERS } from '../shared/data-type-reviewer';
import { PLAYER_STRATIFIERS } from '../shared/player-stratifier';
import { SharedModule } from '../shared/shared.module';
import { SppDiscrepancyStratificationService } from '../spp-totals/spp-discrepancy-stratification.service';
import { SppMagnitudeStratificationService } from '../spp-totals/spp-magnitude-stratification.service';
import { SppNonStandardContributionStratificationService } from '../spp-totals/spp-non-standard-contribution-stratification.service';
import { SppTotalsModule } from '../spp-totals/spp-totals.module';
import { PlayerLookupService } from './player-lookup.service';
import { PlayerSamplerService } from './player-sampler.service';
import { ReportBuilderService } from './report-builder.service';
import { ReviewService } from './review.service';

/**
 * The data-type-agnostic half of the tool, plus the one place its plug-ins are
 * registered. NestJS has no multi-provider mechanism, so the two arrays below
 * are the registry: the two panel pairs each player gets, and every sampling
 * stratum. A new panel pair or stratum means importing its module and adding
 * it here — no change to any harness service.
 */
@Module({
  imports: [
    SharedModule,
    OverviewModule,
    CareerHistoryModule,
    PlayerInfoModule,
    PlayerCharacteristicsModule,
    PlayerAdvancementsModule,
    AdvancementCostsModule,
    SppTotalsModule,
    LastingInjuriesModule,
    PlayerKeywordsModule,
    PlayerStatusModule,
  ],
  providers: [
    PlayerLookupService,
    PlayerSamplerService,
    ReportBuilderService,
    ReportWriterService,
    { provide: REPORT_OUTPUT_PATH, useExisting: ReviewPlayerConfigService },
    ReviewService,
    createRegistryProvider(PLAYER_DATA_TYPE_REVIEWERS, [
      PlayerOverviewReviewerService,
      PlayerCareerHistoryReviewerService,
    ]),
    createRegistryProvider(PLAYER_STRATIFIERS, [
      SppDiscrepancyStratificationService,
      SppMagnitudeStratificationService,
      SppNonStandardContributionStratificationService,
      CharacteristicsChangeStratificationService,
      PlayerAdvancementsStratificationService,
      CurrentInjuryStratificationService,
      HealedInjuryStratificationService,
      RandomPlayerStratificationService,
      StarPlayerStratificationService,
      JourneymanStratificationService,
      PlayerKeywordsStratificationService,
      PlayerStatusStratificationService,
      UnspentSppOutsideRangeStratificationService,
    ]),
  ],
  exports: [ReviewService],
})
export class HarnessModule {}
