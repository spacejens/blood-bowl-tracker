import { ApiClientModule } from '@blood-bowl-tracker/api-client';
import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CoachesModule } from './coaches/coaches.module';
import { CompetitionsModule } from './competitions/competitions.module';
import { ImportTpConfigModule } from './config/import-tp-config.module';
import { ImportTpConfigService } from './config/import-tp-config.service';
import { EraDataConfigModule } from './eras/era-data-config.module';
import { ErasModule } from './eras/eras.module';
import { LeaguesModule } from './leagues/leagues.module';
import { PositionsModule } from './positions/positions.module';
import { RacesModule } from './races/races.module';
import { RulesSetsModule } from './rules-sets/rules-sets.module';
import { SourceModule } from './source/source.module';
import { TeamsModule } from './teams/teams.module';

@Module({})
export class AppModule {
  static register(): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ImportTpConfigModule,
        ApiClientModule.forRootAsync({
          useFactory: (config: ImportTpConfigService) => config.getApiBaseUrl(),
          inject: [ImportTpConfigService],
        }),
        EraDataConfigModule,
        SourceModule,
        LeaguesModule,
        RulesSetsModule,
        ErasModule,
        CompetitionsModule,
        CoachesModule,
        RacesModule,
        TeamsModule,
        PositionsModule,
      ],
    };
  }
}
