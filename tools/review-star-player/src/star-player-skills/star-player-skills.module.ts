import { SkillFormatService } from '@blood-bowl-tracker/review-harness';
import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { StarPlayerSkillsDbRendererService } from './star-player-skills-db-renderer.service';
import { StarPlayerSkillsRawRendererService } from './star-player-skills-raw-renderer.service';
import { StarPlayerSkillsReviewerService } from './star-player-skills-reviewer.service';
import { StarPlayerSkillsStratificationService } from './star-player-skills-stratification.service';

/**
 * The star-skills data type: BBL's and TP's own starting-skill lists for a
 * star, the imported panel from `position_rules_set_skills`, and the two
 * strata for a star whose skills are missing entirely or which has no
 * exclusive skill at all.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    SkillFormatService,
    StarPlayerSkillsDbRendererService,
    StarPlayerSkillsRawRendererService,
    StarPlayerSkillsReviewerService,
    StarPlayerSkillsStratificationService,
  ],
  exports: [
    StarPlayerSkillsReviewerService,
    StarPlayerSkillsStratificationService,
  ],
})
export class StarPlayerSkillsModule {}
