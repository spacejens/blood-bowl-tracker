import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { StarPlayerKeywordsDbRendererService } from './star-player-keywords-db-renderer.service';
import { StarPlayerKeywordsRawRendererService } from './star-player-keywords-raw-renderer.service';
import { StarPlayerKeywordsStratificationService } from './star-player-keywords-stratification.service';

/**
 * The star-keywords aspect: renderers for TP's numeric keyword codes (named
 * through the curated catalogue) and for `position_rules_set_keywords`,
 * stacked by the star-player panel pair, and the stratum for a BB2025 star
 * with no keyword recorded at all.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    StarPlayerKeywordsDbRendererService,
    StarPlayerKeywordsRawRendererService,
    StarPlayerKeywordsStratificationService,
  ],
  exports: [
    StarPlayerKeywordsDbRendererService,
    StarPlayerKeywordsRawRendererService,
    StarPlayerKeywordsStratificationService,
  ],
})
export class StarPlayerKeywordsModule {}
