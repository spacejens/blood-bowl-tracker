import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { BblPlayerInfoRawRendererService } from './bbl-player-info-raw-renderer.service';
import { PlayerInfoDbRendererService } from './player-info-db-renderer.service';
import { RandomPlayerStratificationService } from './random-player-stratification.service';
import { StarPlayerStratificationService } from './star-player-stratification.service';
import { TpPlayerEventLabelsService } from './tp-player-event-labels.service';
import { TpPlayerInfoRawRendererService } from './tp-player-info-raw-renderer.service';

/**
 * The player-info renderers — the overview's identity part: raw panels from
 * each source's own player page or match aggregate, and an imported panel from
 * the database — and two sampling strata (random, star players) other data
 * types can reuse.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    BblPlayerInfoRawRendererService,
    PlayerInfoDbRendererService,
    RandomPlayerStratificationService,
    StarPlayerStratificationService,
    TpPlayerEventLabelsService,
    TpPlayerInfoRawRendererService,
  ],
  exports: [
    BblPlayerInfoRawRendererService,
    PlayerInfoDbRendererService,
    RandomPlayerStratificationService,
    StarPlayerStratificationService,
    TpPlayerInfoRawRendererService,
  ],
})
export class PlayerInfoModule {}
