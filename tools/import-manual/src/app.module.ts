import { ApiClientModule } from '@blood-bowl-tracker/api-client';
import { DynamicModule, Module } from '@nestjs/common';

import { CliModule } from './cli/cli.module';
import { ImportManualConfigModule } from './config/import-manual-config.module';
import { ImportManualConfigService } from './config/import-manual-config.service';

@Module({})
export class AppModule {
  static register(): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ImportManualConfigModule,
        ApiClientModule.forRootAsync({
          useFactory: (config: ImportManualConfigService) => ({
            baseUrl: config.getApiBaseUrl(),
            apiToken: config.getApiToken(),
          }),
          inject: [ImportManualConfigService],
        }),
        CliModule,
      ],
    };
  }
}
