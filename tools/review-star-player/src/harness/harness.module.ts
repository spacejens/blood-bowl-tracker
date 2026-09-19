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
import { StarPlayerCharacteristicsModule } from '../star-player-characteristics/characteristics.module';
import { CharacteristicsChangeStratificationService } from '../star-player-characteristics/characteristics-change-stratification.service';
import { StarPlayerCharacteristicsReviewerService } from '../star-player-characteristics/characteristics-reviewer.service';
import { MissingRulesSetStratificationService } from '../star-player-characteristics/missing-rules-set-stratification.service';
import { EligibilityMismatchStratificationService } from '../star-player-hire-eligibility/eligibility-mismatch-stratification.service';
import { StarPlayerHireEligibilityModule } from '../star-player-hire-eligibility/hire-eligibility.module';
import { HireEligibilityReviewerService } from '../star-player-hire-eligibility/hire-eligibility-reviewer.service';
import { MercenaryVsEmbeddedStratificationService } from '../star-player-hire-eligibility/mercenary-vs-embedded-stratification.service';
import { StarPlayerIdentityModule } from '../star-player-identity/identity.module';
import { StarPlayerIdentityReviewerService } from '../star-player-identity/identity-reviewer.service';
import { RandomStarPlayerStratificationService } from '../star-player-identity/random-star-player-stratification.service';
import { SourceCoverageStratificationService } from '../star-player-identity/source-coverage-stratification.service';
import { StarPlayerSkillsModule } from '../star-player-skills/star-player-skills.module';
import { StarPlayerSkillsReviewerService } from '../star-player-skills/star-player-skills-reviewer.service';
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
 * Reviewer order is report order: identity, then characteristics, then
 * skills, then hire eligibility — narrowing from who the star is to what its
 * numbers are to what it starts with to who may field it.
 */
@Module({
  imports: [
    SharedModule,
    StarPlayerIdentityModule,
    StarPlayerCharacteristicsModule,
    StarPlayerSkillsModule,
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
      StarPlayerIdentityReviewerService,
      StarPlayerCharacteristicsReviewerService,
      StarPlayerSkillsReviewerService,
      HireEligibilityReviewerService,
    ]),
    createRegistryProvider(STAR_PLAYER_STRATIFIERS, [
      CharacteristicsChangeStratificationService,
      MissingRulesSetStratificationService,
      StarPlayerSkillsStratificationService,
      SourceCoverageStratificationService,
      EligibilityMismatchStratificationService,
      MercenaryVsEmbeddedStratificationService,
      RandomStarPlayerStratificationService,
    ]),
  ],
  exports: [ReviewService],
})
export class HarnessModule {}
