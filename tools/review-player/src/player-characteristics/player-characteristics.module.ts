import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { BblPlayerCharacteristicsRawRendererService } from './bbl-player-characteristics-raw-renderer.service';
import { CharacteristicFormatService } from './characteristic-format.service';
import { CharacteristicsChangeStratificationService } from './characteristics-change-stratification.service';
import { PlayerCharacteristicsDbRendererService } from './player-characteristics-db-renderer.service';
import { PlayerCharacteristicsReviewerService } from './player-characteristics-reviewer.service';
import { TpPlayerCharacteristicsRawRendererService } from './tp-player-characteristics-raw-renderer.service';

/**
 * The player-characteristics data type: raw panels from each source's own
 * view of a player's MA/ST/AG/PA/AV, an imported panel comparing the stored
 * `players` row against the baseline its position carries under the era's
 * rules set, and the two strata for a characteristic above or below that
 * baseline.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    BblPlayerCharacteristicsRawRendererService,
    CharacteristicFormatService,
    CharacteristicsChangeStratificationService,
    PlayerCharacteristicsDbRendererService,
    PlayerCharacteristicsReviewerService,
    TpPlayerCharacteristicsRawRendererService,
  ],
  exports: [
    PlayerCharacteristicsReviewerService,
    CharacteristicsChangeStratificationService,
  ],
})
export class PlayerCharacteristicsModule {}
