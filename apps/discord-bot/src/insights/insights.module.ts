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

import { DatabaseTimeoutService } from '../database-timeout.service';
import { FACT_TREE } from './fact-tree.token';
import { FactTreeFactoryService } from './fact-tree-factory.service';
import { FactTreeUtilsService } from './fact-tree-utils.service';
import { CoachToplistService } from './facts/coach-toplist.service';
import { ErasListService } from './facts/eras-list.service';
import { ExpensiveMistakesToplistService } from './facts/expensive-mistakes-toplist.service';
import { PlayerToplistService } from './facts/player-toplist.service';
import { RaceToplistService } from './facts/race-toplist.service';
import { TeamToplistService } from './facts/team-toplist.service';
import { LeaderboardService } from './leaderboard.service';

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
  providers: [
    DatabaseTimeoutService,
    LeaderboardService,
    FactTreeFactoryService,
    FactTreeUtilsService,
    CoachToplistService,
    RaceToplistService,
    TeamToplistService,
    PlayerToplistService,
    ExpensiveMistakesToplistService,
    ErasListService,
    {
      provide: FACT_TREE,
      useFactory: (factory: FactTreeFactoryService) => factory.build(),
      inject: [FactTreeFactoryService],
    },
  ],
  exports: [
    ...GAME_DATA_MODULES,
    DatabaseTimeoutService,
    LeaderboardService,
    FactTreeUtilsService,
    CoachToplistService,
    RaceToplistService,
    TeamToplistService,
    PlayerToplistService,
    ExpensiveMistakesToplistService,
    ErasListService,
    FACT_TREE,
  ],
})
export class InsightsModule {}
