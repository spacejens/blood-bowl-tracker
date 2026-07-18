import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ImportTpConfigModule } from './config/import-tp-config.module';
import { EraDataConfigModule } from './eras/era-data-config.module';
import { SourceModule } from './source/source.module';

@Module({})
export class AppModule {
  static register(): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ImportTpConfigModule,
        EraDataConfigModule,
        SourceModule,
      ],
    };
  }
}
