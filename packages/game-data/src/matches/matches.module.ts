import { Module } from '@nestjs/common';

import { MatchOutcomeResolverService } from './match-outcome-resolver.service';
import { MatchOutcomesService } from './match-outcomes.service';
import { MatchesService } from './matches.service';

@Module({
  providers: [
    MatchesService,
    MatchOutcomeResolverService,
    MatchOutcomesService,
  ],
  exports: [MatchesService, MatchOutcomesService],
})
export class MatchesModule {}
