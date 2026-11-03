import {
  createRegistryProvider,
  REPORT_OUTPUT_PATH,
  ReportWriterService,
} from '@blood-bowl-tracker/review-harness';
import { Module } from '@nestjs/common';

import { StarPlayerReviewConfigService } from '../config/review-star-player-config.service';
import { STAR_PLAYER_DATA_TYPE_REVIEWERS } from '../shared/data-type-reviewer';
import { SharedModule } from '../shared/shared.module';
import { STAR_PLAYER_STRATIFIERS } from '../shared/star-player-stratifier';
import { StarPlayerModule } from '../star-player/star-player.module';
import { StarPlayerReviewerService } from '../star-player/star-player-reviewer.service';
import { StarPlayerCharacteristicsModule } from '../star-player-characteristics/characteristics.module';
import { CharacteristicsChangeStratificationService } from '../star-player-characteristics/characteristics-change-stratification.service';
import { MissingRulesSetStratificationService } from '../star-player-characteristics/missing-rules-set-stratification.service';
import { EligibilityMismatchStratificationService } from '../star-player-hire-eligibility/eligibility-mismatch-stratification.service';
import { StarPlayerHireEligibilityModule } from '../star-player-hire-eligibility/hire-eligibility.module';
import { HireEligibilityReviewerService } from '../star-player-hire-eligibility/hire-eligibility-reviewer.service';
import { MercenaryVsEmbeddedStratificationService } from '../star-player-hire-eligibility/mercenary-vs-embedded-stratification.service';
import { StarPlayerIdentityModule } from '../star-player-identity/identity.module';
import { RandomStarPlayerStratificationService } from '../star-player-identity/random-star-player-stratification.service';
import { SourceCoverageStratificationService } from '../star-player-identity/source-coverage-stratification.service';
import { StarPlayerKeywordsModule } from '../star-player-keywords/star-player-keywords.module';
import { StarPlayerKeywordsStratificationService } from '../star-player-keywords/star-player-keywords-stratification.service';
import { StarPlayerSkillsModule } from '../star-player-skills/star-player-skills.module';
import { StarPlayerSkillsStratificationService } from '../star-player-skills/star-player-skills-stratification.service';
import { ReportBuilderService } from './report-builder.service';
import { ReviewService } from './review.service';
import { StarPlayerLookupService } from './star-player-lookup.service';
import { StarPlayerSamplerService } from './star-player-sampler.service';

/**
 * The data-type-agnostic half of the tool, plus the one place data types are
 * registered. NestJS has no multi-provider mechanism, so the two arrays below
 * are the registry: adding a future data type (special rules, advancement)
 * means importing its module and adding it here — no change to any harness
 * service.
 *
 * Reviewer order is report order: the star-player panel pair (identity,
 * characteristics, starting skills and keywords, stacked), then hire
 * eligibility — from who the star is and what it brings onto the pitch to
 * who may field it. The four aspect modules are still imported for the
 * stratifiers they export.
 */
@Module({
  imports: [
    SharedModule,
    StarPlayerIdentityModule,
    StarPlayerCharacteristicsModule,
    StarPlayerSkillsModule,
    StarPlayerKeywordsModule,
    StarPlayerModule,
    StarPlayerHireEligibilityModule,
  ],
  providers: [
    StarPlayerLookupService,
    StarPlayerSamplerService,
    ReportBuilderService,
    ReportWriterService,
    { provide: REPORT_OUTPUT_PATH, useExisting: StarPlayerReviewConfigService },
    ReviewService,
    createRegistryProvider(STAR_PLAYER_DATA_TYPE_REVIEWERS, [
      StarPlayerReviewerService,
      HireEligibilityReviewerService,
    ]),
    createRegistryProvider(STAR_PLAYER_STRATIFIERS, [
      CharacteristicsChangeStratificationService,
      MissingRulesSetStratificationService,
      StarPlayerSkillsStratificationService,
      StarPlayerKeywordsStratificationService,
      SourceCoverageStratificationService,
      EligibilityMismatchStratificationService,
      MercenaryVsEmbeddedStratificationService,
      RandomStarPlayerStratificationService,
    ]),
  ],
  exports: [ReviewService],
})
export class HarnessModule {}
