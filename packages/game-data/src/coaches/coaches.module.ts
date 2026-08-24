import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { MatchEventCountsModule } from '../shared/match-event-counts.module';
import { MatchOutcomeCountsModule } from '../shared/match-outcome-counts.module';
import { CoachesService } from './coaches.service';

@Module({
  imports: [
    LikePatternModule,
    MatchEventCountsModule,
    MatchOutcomeCountsModule,
  ],
  providers: [CoachesService],
  exports: [CoachesService],
})
export class CoachesModule {}
