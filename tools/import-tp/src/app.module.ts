import { ApiClientModule } from '@blood-bowl-tracker/api-client';
import { DynamicModule, Module } from '@nestjs/common';

import { CoachesModule } from './coaches/coaches.module';
import { CompetitionsModule } from './competitions/competitions.module';
import { ImportTpConfigModule } from './config/import-tp-config.module';
import { ImportTpConfigService } from './config/import-tp-config.service';
import { EraDataConfigModule } from './eras/era-data-config.module';
import { ErasModule } from './eras/eras.module';
import { KeywordsModule } from './keywords/keywords.module';
import { LeaguesModule } from './leagues/leagues.module';
import { MatchFilesModule } from './match-files/match-files.module';
import { OfficialTeamsModule } from './official-teams/official-teams.module';
import { PlayersModule } from './players/players.module';
import { RostersModule } from './rosters/rosters.module';
import { RulesSetsModule } from './rules-sets/rules-sets.module';
import { SourceModule } from './source/source.module';
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
        CoachesModule,
        RostersModule,
        MatchFilesModule,
        OfficialTeamsModule,
        KeywordsModule,
        PlayersModule,
        TrophyAwardsModule,
      ],
    };
  }
}
