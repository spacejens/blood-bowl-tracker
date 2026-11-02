import { SkillFormatService } from '@blood-bowl-tracker/review-harness';
import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { BblPlayerAdvancementsRawRendererService } from './bbl-player-advancements-raw-renderer.service';
import { PlayerAdvancementsDbRendererService } from './player-advancements-db-renderer.service';
import { PlayerAdvancementsReviewerService } from './player-advancements-reviewer.service';
import { PlayerAdvancementsStratificationService } from './player-advancements-stratification.service';
import { PlayerIncreasesDbRendererService } from './player-increases-db-renderer.service';
import { StoredIncreaseRawMatchService } from './stored-increase-raw-match.service';
import { StoredSkillRawMatchService } from './stored-skill-raw-match.service';
import { TpPlayerAdvancementsRawRendererService } from './tp-player-advancements-raw-renderer.service';

/**
 * The player-advancements data type: each source's own view of a player's
 * starting and gained skills and characteristic increases, the imported panel
 * from `player_advancements`, characteristic increases included, and the four
 * strata that oversample differing starting skills, elite skills, randomly
 * rolled skills and freely chosen skills.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    SkillFormatService,
    BblPlayerAdvancementsRawRendererService,
    PlayerAdvancementsDbRendererService,
    PlayerAdvancementsReviewerService,
    PlayerAdvancementsStratificationService,
    PlayerIncreasesDbRendererService,
    StoredIncreaseRawMatchService,
    StoredSkillRawMatchService,
    TpPlayerAdvancementsRawRendererService,
  ],
  exports: [
    PlayerAdvancementsReviewerService,
    PlayerAdvancementsStratificationService,
    StoredIncreaseRawMatchService,
    StoredSkillRawMatchService,
  ],
})
export class PlayerAdvancementsModule {}
