import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { KeywordCoverageStratificationService } from './keyword-coverage-stratification.service';
import { PositionKeywordsDbRendererService } from './position-keywords-db-renderer.service';
import { PositionKeywordsRawRendererService } from './position-keywords-raw-renderer.service';

/**
 * The position-keywords aspect: the raw renderer for TP's numeric keyword
 * codes and the curated catalogue that names them, the database renderer for
 * `position_rules_set_keywords`, and the strata for a BB2025 position with no
 * keyword recorded and a position carrying several. The position-details
 * panel pair stacks the renderers.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    PositionKeywordsDbRendererService,
    PositionKeywordsRawRendererService,
    KeywordCoverageStratificationService,
  ],
  exports: [
    PositionKeywordsDbRendererService,
    PositionKeywordsRawRendererService,
    KeywordCoverageStratificationService,
  ],
})
export class PositionKeywordsModule {}
