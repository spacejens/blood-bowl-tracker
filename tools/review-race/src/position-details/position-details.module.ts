import { Module } from '@nestjs/common';

import { PositionCharacteristicsModule } from '../position-characteristics/position-characteristics.module';
import { PositionKeywordsModule } from '../position-keywords/position-keywords.module';
import { PositionStartingSkillsModule } from '../position-starting-skills/position-starting-skills.module';
import { SharedModule } from '../shared/shared.module';
import { PositionDetailsReviewerService } from './position-details-reviewer.service';

/**
 * The position-details panel pair: one reviewer stacking the characteristics,
 * starting-skills and keyword renderers its three feature modules export.
 */
@Module({
  imports: [
    SharedModule,
    PositionCharacteristicsModule,
    PositionStartingSkillsModule,
    PositionKeywordsModule,
  ],
  providers: [PositionDetailsReviewerService],
  exports: [PositionDetailsReviewerService],
})
export class PositionDetailsModule {}
