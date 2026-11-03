import { SkillFormatService } from '@blood-bowl-tracker/review-harness';
import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { PositionStartingSkillsDbRendererService } from './position-starting-skills-db-renderer.service';
import { PositionStartingSkillsRawRendererService } from './position-starting-skills-raw-renderer.service';
import { StartingSkillsStratificationService } from './starting-skills-stratification.service';

/**
 * The position-starting-skills aspect: the raw renderer for each source's own
 * view of a race's positions' starting skills, the database renderer for
 * `position_rules_set_skills`, and the strata for skills that changed between
 * rules sets or do not exist under the rules set they are stored for. The
 * position-details panel pair stacks the renderers.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    SkillFormatService,
    PositionStartingSkillsDbRendererService,
    PositionStartingSkillsRawRendererService,
    StartingSkillsStratificationService,
  ],
  exports: [
    PositionStartingSkillsDbRendererService,
    PositionStartingSkillsRawRendererService,
    StartingSkillsStratificationService,
  ],
})
export class PositionStartingSkillsModule {}
