import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { BblPlayerStatusRawRendererService } from './bbl-player-status-raw-renderer.service';
import { PlayerStatusDbRendererService } from './player-status-db-renderer.service';
import { PlayerStatusStratificationService } from './player-status-stratification.service';
import { TpPlayerStatusRawRendererService } from './tp-player-status-raw-renderer.service';

/**
 * The player-status renderers — the overview's status part: what each source
 * itself says (BBL's header icons, TP's raw state and isActive) and the stored
 * status — and six strata by stored status.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    BblPlayerStatusRawRendererService,
    PlayerStatusDbRendererService,
    PlayerStatusStratificationService,
    TpPlayerStatusRawRendererService,
  ],
  exports: [
    BblPlayerStatusRawRendererService,
    PlayerStatusDbRendererService,
    PlayerStatusStratificationService,
    TpPlayerStatusRawRendererService,
  ],
})
export class PlayerStatusModule {}
