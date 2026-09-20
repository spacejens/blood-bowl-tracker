import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { KeywordCoverageStratificationService } from './keyword-coverage-stratification.service';
import { PositionKeywordsDbRendererService } from './position-keywords-db-renderer.service';
import { PositionKeywordsRawRendererService } from './position-keywords-raw-renderer.service';
import { PositionKeywordsReviewerService } from './position-keywords-reviewer.service';

/**
 * The position-keywords data type: raw panels for TP's numeric keyword codes
 * and the curated catalogue that names them, an imported panel from
 * `position_rules_set_keywords`, and the two strata for a BB2025 position
 * with no keyword recorded and a position carrying several.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    PositionKeywordsDbRendererService,
    PositionKeywordsRawRendererService,
    PositionKeywordsReviewerService,
    KeywordCoverageStratificationService,
  ],
  exports: [
    PositionKeywordsReviewerService,
    KeywordCoverageStratificationService,
  ],
})
export class PositionKeywordsModule {}
