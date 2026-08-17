import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { CompetitionGroupsService } from './competition-groups.service';

@Module({
  imports: [LikePatternModule],
  providers: [CompetitionGroupsService],
  exports: [CompetitionGroupsService],
})
export class CompetitionGroupsModule {}
