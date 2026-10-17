import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { TrophiesService } from './trophies.service';
import { TrophyAwardRuleDescriptionService } from './trophy-award-rule-description.service';
import { TrophyRuleCurationSyncService } from './trophy-rule-curation-sync.service';

@Module({
  imports: [LikePatternModule],
  providers: [
    TrophiesService,
    TrophyAwardRuleDescriptionService,
    TrophyRuleCurationSyncService,
  ],
  exports: [TrophiesService, TrophyAwardRuleDescriptionService],
})
export class TrophiesModule {}
