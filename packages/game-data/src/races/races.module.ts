import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { MatchOutcomeCountsModule } from '../shared/match-outcome-counts.module';
import { RacesService } from './races.service';

@Module({
  imports: [LikePatternModule, MatchOutcomeCountsModule],
  providers: [RacesService],
  exports: [RacesService],
})
export class RacesModule {}
