import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { StarPlayerIdentityDbRendererService } from './identity-db-renderer.service';
import { StarPlayerIdentityRawRendererService } from './identity-raw-renderer.service';
import { RandomStarPlayerStratificationService } from './random-star-player-stratification.service';
import { SourceCoverageStratificationService } from './source-coverage-stratification.service';

/**
 * The star-identity aspect: the raw renderer for each source's own view of
 * the star and the database renderer, both stacked by the star-player panel
 * pair, plus the star-level sampling strata every data type reuses.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    RandomStarPlayerStratificationService,
    SourceCoverageStratificationService,
    StarPlayerIdentityDbRendererService,
    StarPlayerIdentityRawRendererService,
  ],
  exports: [
    RandomStarPlayerStratificationService,
    SourceCoverageStratificationService,
    StarPlayerIdentityDbRendererService,
    StarPlayerIdentityRawRendererService,
  ],
})
export class StarPlayerIdentityModule {}
