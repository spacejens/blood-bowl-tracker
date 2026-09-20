import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { StarPlayerKeywordsDbRendererService } from './star-player-keywords-db-renderer.service';
import { StarPlayerKeywordsRawRendererService } from './star-player-keywords-raw-renderer.service';
import { StarPlayerKeywordsReviewerService } from './star-player-keywords-reviewer.service';
import { StarPlayerKeywordsStratificationService } from './star-player-keywords-stratification.service';

/**
 * The star-keywords data type: the raw panel for TP's numeric keyword codes
 * and the curated catalogue that names them, the imported panel from
 * `position_rules_set_keywords`, and the stratum for a BB2025 star with no
 * keyword recorded at all.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    StarPlayerKeywordsDbRendererService,
    StarPlayerKeywordsRawRendererService,
    StarPlayerKeywordsReviewerService,
    StarPlayerKeywordsStratificationService,
  ],
  exports: [
    StarPlayerKeywordsReviewerService,
    StarPlayerKeywordsStratificationService,
  ],
})
export class StarPlayerKeywordsModule {}
