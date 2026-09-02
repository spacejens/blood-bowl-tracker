import {
  createRegistryProvider,
  REPORT_OUTPUT_PATH,
  ReportWriterService,
} from '@blood-bowl-tracker/review-harness';
import { Module } from '@nestjs/common';

import { RaceReviewConfigService } from '../config/review-race-config.service';
import { PositionAvailabilityModule } from '../position-availability/position-availability.module';
import { PositionAvailabilityReviewerService } from '../position-availability/position-availability-reviewer.service';
import { CharacteristicsChangeStratificationService } from '../position-characteristics/characteristics-change-stratification.service';
import { PositionCharacteristicsModule } from '../position-characteristics/position-characteristics.module';
import { PositionCharacteristicsReviewerService } from '../position-characteristics/position-characteristics-reviewer.service';
import { EraAvailabilityStratificationService } from '../race-identity/era-availability-stratification.service';
import { NameMismatchStratificationService } from '../race-identity/name-mismatch-stratification.service';
import { RaceIdentityModule } from '../race-identity/race-identity.module';
import { RaceIdentityReviewerService } from '../race-identity/race-identity-reviewer.service';
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
 * Reviewer order is report order: identity, then availability, then
 * characteristics — narrowing from what the race is to what its positions are
 * to what those positions' numbers are.
 */
@Module({
  imports: [
    SharedModule,
    RaceIdentityModule,
    PositionAvailabilityModule,
    PositionCharacteristicsModule,
  ],
  providers: [
    RaceLookupService,
    RaceSamplerService,
    ReportBuilderService,
    ReportWriterService,
    { provide: REPORT_OUTPUT_PATH, useExisting: RaceReviewConfigService },
    ReviewService,
    createRegistryProvider(RACE_DATA_TYPE_REVIEWERS, [
      RaceIdentityReviewerService,
      PositionAvailabilityReviewerService,
      PositionCharacteristicsReviewerService,
    ]),
    createRegistryProvider(RACE_STRATIFIERS, [
      EraAvailabilityStratificationService,
      CharacteristicsChangeStratificationService,
      SourceCoverageStratificationService,
      NameMismatchStratificationService,
      RandomRaceStratificationService,
    ]),
  ],
  exports: [ReviewService],
})
export class HarnessModule {}
