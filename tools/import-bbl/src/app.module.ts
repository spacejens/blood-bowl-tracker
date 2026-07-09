import {
  ApiClientConfigService,
  ApiClientModule,
} from '@blood-bowl-tracker/api-client';
import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CoachesModule } from './coaches/coaches.module';
import { LeaguesModule } from './leagues/leagues.module';
import { RacesModule } from './races/races.module';

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
        CoachesModule,
        RacesModule,
      ],
    };
  }
}
