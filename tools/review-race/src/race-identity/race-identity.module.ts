import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { EraAvailabilityStratificationService } from './era-availability-stratification.service';
import { NameMismatchStratificationService } from './name-mismatch-stratification.service';
import { RaceIdentityDbRendererService } from './race-identity-db-renderer.service';
import { RaceIdentityRawRendererService } from './race-identity-raw-renderer.service';
import { RandomRaceStratificationService } from './random-race-stratification.service';
import { SourceCoverageStratificationService } from './source-coverage-stratification.service';

/**
 * The race-identity aspect: the raw and database renderers for what each
 * source calls the race, and the race-level sampling strata every aspect
 * reuses. The race-and-availability panel pair stacks the renderers.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    EraAvailabilityStratificationService,
    NameMismatchStratificationService,
    RaceIdentityDbRendererService,
    RaceIdentityRawRendererService,
    RandomRaceStratificationService,
    SourceCoverageStratificationService,
  ],
  exports: [
    EraAvailabilityStratificationService,
    NameMismatchStratificationService,
    RaceIdentityDbRendererService,
    RaceIdentityRawRendererService,
    RandomRaceStratificationService,
    SourceCoverageStratificationService,
  ],
})
export class RaceIdentityModule {}
