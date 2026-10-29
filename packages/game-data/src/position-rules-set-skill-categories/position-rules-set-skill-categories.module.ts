import { Module } from '@nestjs/common';

import { PositionRulesSetSkillCategoriesService } from './position-rules-set-skill-categories.service';

@Module({
  providers: [PositionRulesSetSkillCategoriesService],
  exports: [PositionRulesSetSkillCategoriesService],
})
export class PositionRulesSetSkillCategoriesModule {}
