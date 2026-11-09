import { Module } from '@nestjs/common';

import { SkillsQueriesService } from './skills-queries.service';

@Module({
  providers: [SkillsQueriesService],
  exports: [SkillsQueriesService],
})
export class SkillsQueriesModule {}
