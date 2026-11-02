import { CharacteristicFormatService } from '@blood-bowl-tracker/review-harness';
import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { BblPlayerCharacteristicsRawRendererService } from './bbl-player-characteristics-raw-renderer.service';
import { CharacteristicsChangeStratificationService } from './characteristics-change-stratification.service';
import { PlayerCharacteristicsDbRendererService } from './player-characteristics-db-renderer.service';
import { TpPlayerCharacteristicsRawRendererService } from './tp-player-characteristics-raw-renderer.service';

/**
 * The characteristics renderers of the career history (each source's own
 * MA/ST/AG/PA/AV — TP's under its position template — and the stored
 * `players` row against its position's baseline) and the two strata for a
 * characteristic above or below that baseline.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    BblPlayerCharacteristicsRawRendererService,
    CharacteristicFormatService,
    CharacteristicsChangeStratificationService,
    PlayerCharacteristicsDbRendererService,
    TpPlayerCharacteristicsRawRendererService,
  ],
  exports: [
    BblPlayerCharacteristicsRawRendererService,
    CharacteristicsChangeStratificationService,
    PlayerCharacteristicsDbRendererService,
    TpPlayerCharacteristicsRawRendererService,
  ],
})
export class PlayerCharacteristicsModule {}
