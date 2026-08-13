import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { BblPlayerInfoRawRendererService } from './bbl-player-info-raw-renderer.service';
import { PlayerInfoDbRendererService } from './player-info-db-renderer.service';
import { PlayerInfoReviewerService } from './player-info-reviewer.service';
import { RandomPlayerStratificationService } from './random-player-stratification.service';
import { StarPlayerStratificationService } from './star-player-stratification.service';
import { TpPlayerEventLabelsService } from './tp-player-event-labels.service';
import { TpPlayerInfoRawRendererService } from './tp-player-info-raw-renderer.service';

/**
 * The player-info data type: raw panels from each source's own player page or
 * match aggregate, an imported panel from the database, and two sampling
 * strata (random, star players) both other data types can reuse.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    BblPlayerInfoRawRendererService,
    PlayerInfoDbRendererService,
    PlayerInfoReviewerService,
    RandomPlayerStratificationService,
    StarPlayerStratificationService,
    TpPlayerEventLabelsService,
    TpPlayerInfoRawRendererService,
  ],
  exports: [
    PlayerInfoReviewerService,
    RandomPlayerStratificationService,
    StarPlayerStratificationService,
  ],
})
export class PlayerInfoModule {}
