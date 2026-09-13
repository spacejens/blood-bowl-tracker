import { CharacteristicFormatService } from '@blood-bowl-tracker/review-harness';
import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { CharacteristicsChangeStratificationService } from './characteristics-change-stratification.service';
import { StarPlayerCharacteristicsDbRendererService } from './characteristics-db-renderer.service';
import { StarPlayerCharacteristicsRawRendererService } from './characteristics-raw-renderer.service';
import { StarPlayerCharacteristicsReviewerService } from './characteristics-reviewer.service';
import { MissingRulesSetStratificationService } from './missing-rules-set-stratification.service';

/**
 * The star-characteristics data type: each source's own MA/ST/AG/PA/AV for
 * this star, the imported panel from `position_rules_sets`, and the strata
 * that sample stars whose stat line changed between rules sets or is missing
 * for a rules set their stored eligibility implies.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    CharacteristicFormatService,
    CharacteristicsChangeStratificationService,
    MissingRulesSetStratificationService,
    StarPlayerCharacteristicsDbRendererService,
    StarPlayerCharacteristicsRawRendererService,
    StarPlayerCharacteristicsReviewerService,
  ],
  exports: [
    CharacteristicsChangeStratificationService,
    MissingRulesSetStratificationService,
    StarPlayerCharacteristicsReviewerService,
  ],
})
export class StarPlayerCharacteristicsModule {}
