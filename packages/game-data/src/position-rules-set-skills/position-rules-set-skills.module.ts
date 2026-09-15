import { Module } from '@nestjs/common';

import { PositionRulesSetSkillsService } from './position-rules-set-skills.service';

@Module({
  providers: [PositionRulesSetSkillsService],
  exports: [PositionRulesSetSkillsService],
})
export class PositionRulesSetSkillsModule {}
