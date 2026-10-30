import { Module } from '@nestjs/common';

import { MatchScopeFilterModule } from '../shared/match-scope-filter.module';
import { SppModule } from '../spp/spp.module';
import { MaxCountTrophyRuleService } from './max-count-trophy-rule.service';
import { MaxSppSumTrophyRuleService } from './max-spp-sum-trophy-rule.service';
import { MissingTrophyAwardsService } from './missing-trophy-awards.service';
import { CareerThresholdTrophyRuleService } from './threshold-trophy-rule.service';
import { TrophyAwardsService } from './trophy-awards.service';
import { TrophyRuleEventTypeFilterService } from './trophy-rule-event-type-filter.service';
import { TrophyRulePositionFilterService } from './trophy-rule-position-filter.service';
import { TrophyTiedWinnersService } from './trophy-tied-winners.service';

@Module({
  imports: [MatchScopeFilterModule, SppModule],
  providers: [
    TrophyAwardsService,
    TrophyRuleEventTypeFilterService,
    TrophyRulePositionFilterService,
    TrophyTiedWinnersService,
    MaxCountTrophyRuleService,
    MaxSppSumTrophyRuleService,
    CareerThresholdTrophyRuleService,
    MissingTrophyAwardsService,
  ],
  exports: [TrophyAwardsService, MissingTrophyAwardsService],
})
export class TrophyAwardsModule {}
