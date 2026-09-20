import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { PlayerKeywordsDbRendererService } from './player-keywords-db-renderer.service';
import { PlayerKeywordsRawRendererService } from './player-keywords-raw-renderer.service';
import { PlayerKeywordsReviewerService } from './player-keywords-reviewer.service';
import { PlayerKeywordsStratificationService } from './player-keywords-stratification.service';

/**
 * The player-keywords data type: raw panel for TP's numeric template keyword
 * codes and the curated catalogue that names them, an imported panel from
 * `position_rules_set_keywords` for the player's position, and the one
 * stratum for a BB2025 position with no keyword recorded.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    PlayerKeywordsDbRendererService,
    PlayerKeywordsRawRendererService,
    PlayerKeywordsReviewerService,
    PlayerKeywordsStratificationService,
  ],
  exports: [PlayerKeywordsReviewerService, PlayerKeywordsStratificationService],
})
export class PlayerKeywordsModule {}
