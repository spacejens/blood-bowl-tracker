import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { StarPlayerIdentityDbRendererService } from './identity-db-renderer.service';
import { StarPlayerIdentityRawRendererService } from './identity-raw-renderer.service';
import { StarPlayerIdentityReviewerService } from './identity-reviewer.service';
import { RandomStarPlayerStratificationService } from './random-star-player-stratification.service';
import { SourceCoverageStratificationService } from './source-coverage-stratification.service';

/**
 * The star-identity data type: raw panels from each source's own view of the
 * star, an imported panel from the database, and the star-level sampling
 * strata every data type reuses.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    RandomStarPlayerStratificationService,
    SourceCoverageStratificationService,
    StarPlayerIdentityDbRendererService,
    StarPlayerIdentityRawRendererService,
    StarPlayerIdentityReviewerService,
  ],
  exports: [
    RandomStarPlayerStratificationService,
    SourceCoverageStratificationService,
    StarPlayerIdentityReviewerService,
  ],
})
export class StarPlayerIdentityModule {}
