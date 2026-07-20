import { ApiClientModule } from '@blood-bowl-tracker/api-client';
import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ImportManualConfigModule } from './config/import-manual-config.module';
import { ImportManualConfigService } from './config/import-manual-config.service';
import { ManualImportModule } from './import/manual-import.module';

@Module({})
export class AppModule {
  static register(): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ImportManualConfigModule,
        ApiClientModule.forRootAsync({
          useFactory: (config: ImportManualConfigService) =>
            config.getApiBaseUrl(),
          inject: [ImportManualConfigService],
        }),
        ManualImportModule,
      ],
    };
  }
}
