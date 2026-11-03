import {
  createRegistryProvider,
  REPORT_OUTPUT_PATH,
  ReportWriterService,
} from '@blood-bowl-tracker/review-harness';
import { Module } from '@nestjs/common';

import { RaceReviewConfigService } from '../config/review-race-config.service';
import { CharacteristicsChangeStratificationService } from '../position-characteristics/characteristics-change-stratification.service';
import { PositionCharacteristicsModule } from '../position-characteristics/position-characteristics.module';
import { PositionDetailsModule } from '../position-details/position-details.module';
import { PositionDetailsReviewerService } from '../position-details/position-details-reviewer.service';
import { KeywordCoverageStratificationService } from '../position-keywords/keyword-coverage-stratification.service';
import { PositionKeywordsModule } from '../position-keywords/position-keywords.module';
import { PositionStartingSkillsModule } from '../position-starting-skills/position-starting-skills.module';
import { StartingSkillsStratificationService } from '../position-starting-skills/starting-skills-stratification.service';
import { RaceAndAvailabilityModule } from '../race-and-availability/race-and-availability.module';
import { RaceAndAvailabilityReviewerService } from '../race-and-availability/race-and-availability-reviewer.service';
import { EraAvailabilityStratificationService } from '../race-identity/era-availability-stratification.service';
import { NameMismatchStratificationService } from '../race-identity/name-mismatch-stratification.service';
import { RaceIdentityModule } from '../race-identity/race-identity.module';
import { RandomRaceStratificationService } from '../race-identity/random-race-stratification.service';
import { SourceCoverageStratificationService } from '../race-identity/source-coverage-stratification.service';
import { RACE_DATA_TYPE_REVIEWERS } from '../shared/data-type-reviewer';
import { RACE_STRATIFIERS } from '../shared/race-stratifier';
import { SharedModule } from '../shared/shared.module';
import { RaceLookupService } from './race-lookup.service';
import { RaceSamplerService } from './race-sampler.service';
import { ReportBuilderService } from './report-builder.service';
import { ReviewService } from './review.service';

/**
 * The data-type-agnostic half of the tool, plus the one place data types are
 * registered. NestJS has no multi-provider mechanism, so the two arrays below
 * are the registry: adding a future data type (skills, team-value costs)
 * means importing its module and adding it here — no change to any harness
 * service.
 *
 * Reviewer order is report order: race-and-availability (what the race is
 * and which positions it can field), then position-details (those
 * positions' characteristics, starting skills and BB2025 keywords).
 */
@Module({
  imports: [
    SharedModule,
    RaceAndAvailabilityModule,
    PositionDetailsModule,
    RaceIdentityModule,
    PositionCharacteristicsModule,
    PositionStartingSkillsModule,
    PositionKeywordsModule,
  ],
  providers: [
    RaceLookupService,
    RaceSamplerService,
    ReportBuilderService,
    ReportWriterService,
    { provide: REPORT_OUTPUT_PATH, useExisting: RaceReviewConfigService },
    ReviewService,
    createRegistryProvider(RACE_DATA_TYPE_REVIEWERS, [
      RaceAndAvailabilityReviewerService,
      PositionDetailsReviewerService,
    ]),
    createRegistryProvider(RACE_STRATIFIERS, [
      EraAvailabilityStratificationService,
      CharacteristicsChangeStratificationService,
      StartingSkillsStratificationService,
      KeywordCoverageStratificationService,
      SourceCoverageStratificationService,
      NameMismatchStratificationService,
      RandomRaceStratificationService,
    ]),
  ],
  exports: [ReviewService],
})
export class HarnessModule {}
