import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { EraAvailabilityStratificationService } from './era-availability-stratification.service';
import { NameMismatchStratificationService } from './name-mismatch-stratification.service';
import { RaceIdentityDbRendererService } from './race-identity-db-renderer.service';
import { RaceIdentityRawRendererService } from './race-identity-raw-renderer.service';
import { RaceIdentityReviewerService } from './race-identity-reviewer.service';
import { RandomRaceStratificationService } from './random-race-stratification.service';
import { SourceCoverageStratificationService } from './source-coverage-stratification.service';

/**
 * The race-identity data type: raw panels from each source's own view of the
 * race, an imported panel from the database, and the race-level sampling
 * strata every data type reuses.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    EraAvailabilityStratificationService,
    NameMismatchStratificationService,
    RaceIdentityDbRendererService,
    RaceIdentityRawRendererService,
    RaceIdentityReviewerService,
    RandomRaceStratificationService,
    SourceCoverageStratificationService,
  ],
  exports: [
    EraAvailabilityStratificationService,
    NameMismatchStratificationService,
    RaceIdentityReviewerService,
    RandomRaceStratificationService,
    SourceCoverageStratificationService,
  ],
})
export class RaceIdentityModule {}
