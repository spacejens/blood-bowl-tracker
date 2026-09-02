import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { CharacteristicFormatService } from './characteristic-format.service';
import { CharacteristicsChangeStratificationService } from './characteristics-change-stratification.service';
import { PositionCharacteristicsDbRendererService } from './position-characteristics-db-renderer.service';
import { PositionCharacteristicsRawRendererService } from './position-characteristics-raw-renderer.service';
import { PositionCharacteristicsReviewerService } from './position-characteristics-reviewer.service';

/**
 * The position-characteristics data type: raw panels from each source's own
 * view of a race's positions' MA/ST/AG/PA/AV values, an imported panel from
 * the database's `position_rules_sets` rows, and the two strata for
 * characteristics that changed between rules sets or are missing entirely.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    CharacteristicFormatService,
    PositionCharacteristicsDbRendererService,
    PositionCharacteristicsRawRendererService,
    PositionCharacteristicsReviewerService,
    CharacteristicsChangeStratificationService,
  ],
  exports: [
    PositionCharacteristicsReviewerService,
    CharacteristicsChangeStratificationService,
  ],
})
export class PositionCharacteristicsModule {}
