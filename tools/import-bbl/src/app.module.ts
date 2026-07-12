import {
  ApiClientConfigService,
  ApiClientModule,
} from '@blood-bowl-tracker/api-client';
import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CoachesModule } from './coaches/coaches.module';
import { CompetitionsModule } from './competitions/competitions.module';
import { ErasModule } from './eras/eras.module';
import { LeaguesModule } from './leagues/leagues.module';
import { MatchesModule } from './matches/matches.module';
import { PlayersModule } from './players/players.module';
import { PositionsModule } from './positions/positions.module';
import { RacesModule } from './races/races.module';
import { RulesSetsModule } from './rules-sets/rules-sets.module';
import { TeamParticipationModule } from './team-participation/team-participation.module';
import { TeamsModule } from './teams/teams.module';

@Module({})
export class AppModule {
  static register(): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ApiClientModule.forRootAsync({
          useFactory: (config: ApiClientConfigService) =>
            config.getApiBaseUrl(),
          inject: [ApiClientConfigService],
        }),
        LeaguesModule,
        RulesSetsModule,
        ErasModule,
        CoachesModule,
        CompetitionsModule,
        MatchesModule,
        RacesModule,
        PlayersModule,
        PositionsModule,
        TeamsModule,
        TeamParticipationModule,
      ],
    };
  }
}
