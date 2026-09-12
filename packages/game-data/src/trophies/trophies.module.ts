import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { TrophiesService } from './trophies.service';
import { TrophyAwardRuleDescriptionService } from './trophy-award-rule-description.service';

@Module({
  imports: [LikePatternModule],
  providers: [TrophiesService, TrophyAwardRuleDescriptionService],
  exports: [TrophiesService, TrophyAwardRuleDescriptionService],
})
export class TrophiesModule {}
