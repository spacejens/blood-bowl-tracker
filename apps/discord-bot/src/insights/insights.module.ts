import {
  CoachesModule,
  CompetitionsModule,
  ErasModule,
  ExternalSystemsModule,
  LeaguesModule,
  MatchesModule,
  PlayersModule,
  PositionsModule,
  RacesModule,
  RulesSetsModule,
  TeamsModule,
} from '@blood-bowl-tracker/game-data';
import { Module } from '@nestjs/common';

import { StatsSummaryService } from './stats-summary.service';

const GAME_DATA_MODULES = [
  CoachesModule,
  TeamsModule,
  MatchesModule,
  CompetitionsModule,
  LeaguesModule,
  RulesSetsModule,
  ErasModule,
  PlayersModule,
  PositionsModule,
  RacesModule,
  ExternalSystemsModule,
];

@Module({
  imports: GAME_DATA_MODULES,
  providers: [StatsSummaryService],
  exports: [StatsSummaryService, ...GAME_DATA_MODULES],
})
export class InsightsModule {}
