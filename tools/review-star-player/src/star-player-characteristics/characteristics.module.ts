import { CharacteristicFormatService } from '@blood-bowl-tracker/review-harness';
import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { CharacteristicsChangeStratificationService } from './characteristics-change-stratification.service';
import { StarPlayerCharacteristicsDbRendererService } from './characteristics-db-renderer.service';
import { StarPlayerCharacteristicsRawRendererService } from './characteristics-raw-renderer.service';
import { MissingRulesSetStratificationService } from './missing-rules-set-stratification.service';

/**
 * The star-characteristics aspect: renderers for each source's own
 * MA/ST/AG/PA/AV and for `position_rules_sets`, stacked by the star-player
 * panel pair, and the strata that sample stars whose stat line changed
 * between rules sets or is missing for a rules set their stored eligibility
 * implies.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    CharacteristicFormatService,
    CharacteristicsChangeStratificationService,
    MissingRulesSetStratificationService,
    StarPlayerCharacteristicsDbRendererService,
    StarPlayerCharacteristicsRawRendererService,
  ],
  exports: [
    CharacteristicsChangeStratificationService,
    MissingRulesSetStratificationService,
    StarPlayerCharacteristicsDbRendererService,
    StarPlayerCharacteristicsRawRendererService,
  ],
})
export class StarPlayerCharacteristicsModule {}
