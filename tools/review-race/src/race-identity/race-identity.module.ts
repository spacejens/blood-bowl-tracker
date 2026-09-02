import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { RaceIdentityDbRendererService } from './race-identity-db-renderer.service';
import { RaceIdentityRawRendererService } from './race-identity-raw-renderer.service';
import { RaceIdentityReviewerService } from './race-identity-reviewer.service';

/**
 * The race-identity data type: raw panels from each source's own view of the
 * race, an imported panel from the database, and (added in the next task) the
 * race-level sampling strata every data type reuses.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    RaceIdentityDbRendererService,
    RaceIdentityRawRendererService,
    RaceIdentityReviewerService,
  ],
  exports: [RaceIdentityReviewerService],
})
export class RaceIdentityModule {}
