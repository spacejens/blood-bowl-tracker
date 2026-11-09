import { Module } from '@nestjs/common';

import { MatchOutcomeCountsService } from './match-outcome-counts.service';

@Module({
  providers: [MatchOutcomeCountsService],
  exports: [MatchOutcomeCountsService],
})
export class MatchOutcomeCountsModule {}
