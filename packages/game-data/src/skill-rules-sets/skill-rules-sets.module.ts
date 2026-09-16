import { Module } from '@nestjs/common';

import { SkillRulesSetsService } from './skill-rules-sets.service';

@Module({
  providers: [SkillRulesSetsService],
  exports: [SkillRulesSetsService],
})
export class SkillRulesSetsModule {}
