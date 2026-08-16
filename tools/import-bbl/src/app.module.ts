import { ApiClientModule } from '@blood-bowl-tracker/api-client';
import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CoachesModule } from './coaches/coaches.module';
import { CompetitionsModule } from './competitions/competitions.module';
import { ImportBblConfigModule } from './config/import-bbl-config.module';
import { ImportBblConfigService } from './config/import-bbl-config.service';
import { ErasModule } from './eras/eras.module';
import { LeaguesModule } from './leagues/leagues.module';
import { MatchEventsModule } from './match-events/match-events.module';
import { MatchesModule } from './matches/matches.module';
import { PlayersModule } from './players/players.module';
import { PositionsModule } from './positions/positions.module';
import { RacesModule } from './races/races.module';
import { RulesSetsModule } from './rules-sets/rules-sets.module';
import { TeamParticipationModule } from './team-participation/team-participation.module';
import { TeamsModule } from './teams/teams.module';
import { TrophyAwardsModule } from './trophy-awards/trophy-awards.module';

@Module({})
export class AppModule {
  static register(): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ImportBblConfigModule,
        ApiClientModule.forRootAsync({
          useFactory: (config: ImportBblConfigService) => ({
            baseUrl: config.getApiBaseUrl(),
            apiToken: config.getApiToken(),
          }),
          inject: [ImportBblConfigService],
        }),
        LeaguesModule,
        RulesSetsModule,
        ErasModule,
        CoachesModule,
        CompetitionsModule,
        MatchesModule,
        MatchEventsModule,
        RacesModule,
        PlayersModule,
        PositionsModule,
        TeamsModule,
        TeamParticipationModule,
        TrophyAwardsModule,
      ],
    };
  }
}
