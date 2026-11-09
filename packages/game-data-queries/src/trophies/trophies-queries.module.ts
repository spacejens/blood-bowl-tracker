import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { TrophiesQueriesService } from './trophies-queries.service';
import { TrophyAwardRuleDescriptionService } from './trophy-award-rule-description.service';

@Module({
  imports: [LikePatternModule],
  providers: [TrophiesQueriesService, TrophyAwardRuleDescriptionService],
  exports: [TrophiesQueriesService, TrophyAwardRuleDescriptionService],
})
export class TrophiesQueriesModule {}
