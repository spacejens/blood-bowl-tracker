import { SkillFormatService } from '@blood-bowl-tracker/review-harness';
import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { BblPlayerAdvancementsRawRendererService } from './bbl-player-advancements-raw-renderer.service';
import { PlayerAdvancementsStratificationService } from './player-advancements-stratification.service';
import { StoredIncreaseRawMatchService } from './stored-increase-raw-match.service';
import { StoredSkillRawMatchService } from './stored-skill-raw-match.service';
import { TpPlayerAdvancementsRawRendererService } from './tp-player-advancements-raw-renderer.service';

/**
 * Each source's own list of a player's SPP figures, skills and characteristic
 * increases, the services that check stored skills and increases against it,
 * and the four strata that oversample differing starting skills, elite skills,
 * randomly rolled skills and freely chosen skills.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    SkillFormatService,
    BblPlayerAdvancementsRawRendererService,
    PlayerAdvancementsStratificationService,
    StoredIncreaseRawMatchService,
    StoredSkillRawMatchService,
    TpPlayerAdvancementsRawRendererService,
  ],
  exports: [
    BblPlayerAdvancementsRawRendererService,
    PlayerAdvancementsStratificationService,
    StoredIncreaseRawMatchService,
    StoredSkillRawMatchService,
    TpPlayerAdvancementsRawRendererService,
  ],
})
export class PlayerAdvancementsModule {}
