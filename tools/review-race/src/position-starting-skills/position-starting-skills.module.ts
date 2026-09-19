import { SkillFormatService } from '@blood-bowl-tracker/review-harness';
import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { PositionStartingSkillsDbRendererService } from './position-starting-skills-db-renderer.service';
import { PositionStartingSkillsRawRendererService } from './position-starting-skills-raw-renderer.service';
import { PositionStartingSkillsReviewerService } from './position-starting-skills-reviewer.service';
import { StartingSkillsStratificationService } from './starting-skills-stratification.service';

/**
 * The position-starting-skills data type: raw panels from each source's own
 * view of a race's positions' starting skills, an imported panel from
 * `position_rules_set_skills`, and the two strata for skills that changed
 * between rules sets or do not exist under the rules set they are stored for.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    SkillFormatService,
    PositionStartingSkillsDbRendererService,
    PositionStartingSkillsRawRendererService,
    PositionStartingSkillsReviewerService,
    StartingSkillsStratificationService,
  ],
  exports: [
    PositionStartingSkillsReviewerService,
    StartingSkillsStratificationService,
  ],
})
export class PositionStartingSkillsModule {}
