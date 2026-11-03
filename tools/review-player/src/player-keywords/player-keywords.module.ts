import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { PlayerKeywordsDbRendererService } from './player-keywords-db-renderer.service';
import { PlayerKeywordsRawRendererService } from './player-keywords-raw-renderer.service';
import { PlayerKeywordsStratificationService } from './player-keywords-stratification.service';

/**
 * The player-keywords renderers — the overview's keywords part: TP's numeric
 * template keyword codes with the curated catalogue that names them, and
 * `position_rules_set_keywords` for the player's position — and the one
 * stratum for a BB2025 position with no keyword recorded.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    PlayerKeywordsDbRendererService,
    PlayerKeywordsRawRendererService,
    PlayerKeywordsStratificationService,
  ],
  exports: [
    PlayerKeywordsDbRendererService,
    PlayerKeywordsRawRendererService,
    PlayerKeywordsStratificationService,
  ],
})
export class PlayerKeywordsModule {}
