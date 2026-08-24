import { ApiClientModule } from '@blood-bowl-tracker/api-client';
import { DynamicModule, Module } from '@nestjs/common';

import { CoachesModule } from './coaches/coaches.module';
import { CompetitionsModule } from './competitions/competitions.module';
import { ImportTpConfigModule } from './config/import-tp-config.module';
import { ImportTpConfigService } from './config/import-tp-config.service';
import { EraDataConfigModule } from './eras/era-data-config.module';
import { ErasModule } from './eras/eras.module';
import { LeaguesModule } from './leagues/leagues.module';
import { MatchEventsModule } from './match-events/match-events.module';
import { MatchesModule } from './matches/matches.module';
import { PlayersModule } from './players/players.module';
import { PositionsModule } from './positions/positions.module';
import { RacesModule } from './races/races.module';
import { RulesSetsModule } from './rules-sets/rules-sets.module';
import { SourceModule } from './source/source.module';
import { TeamParticipationModule } from './team-participation/team-participation.module';
import { TeamsModule } from './teams/teams.module';
import { TrophyAwardsModule } from './trophy-awards/trophy-awards.module';

@Module({})
export class AppModule {
  static register(): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ImportTpConfigModule,
        ApiClientModule.forRootAsync({
          useFactory: (config: ImportTpConfigService) => ({
            baseUrl: config.getApiBaseUrl(),
            apiToken: config.getApiToken(),
          }),
          inject: [ImportTpConfigService],
        }),
        EraDataConfigModule,
        SourceModule,
        LeaguesModule,
        RulesSetsModule,
        ErasModule,
        CompetitionsModule,
        MatchesModule,
        CoachesModule,
        RacesModule,
        TeamsModule,
        TeamParticipationModule,
        PositionsModule,
        PlayersModule,
        MatchEventsModule,
        TrophyAwardsModule,
      ],
    };
  }
}
