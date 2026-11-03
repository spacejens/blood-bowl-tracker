import { CharacteristicFormatService } from '@blood-bowl-tracker/review-harness';
import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { CharacteristicsChangeStratificationService } from './characteristics-change-stratification.service';
import { PositionCharacteristicsDbRendererService } from './position-characteristics-db-renderer.service';
import { PositionCharacteristicsRawRendererService } from './position-characteristics-raw-renderer.service';

/**
 * The position-characteristics aspect: the raw renderer for each source's own
 * view of a race's positions' MA/ST/AG/PA/AV values, the database renderer
 * for `position_rules_sets`, and the strata for characteristics that changed
 * between rules sets or are missing entirely. The position-details panel pair
 * stacks the renderers.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    CharacteristicFormatService,
    PositionCharacteristicsDbRendererService,
    PositionCharacteristicsRawRendererService,
    CharacteristicsChangeStratificationService,
  ],
  exports: [
    PositionCharacteristicsDbRendererService,
    PositionCharacteristicsRawRendererService,
    CharacteristicsChangeStratificationService,
  ],
})
export class PositionCharacteristicsModule {}
