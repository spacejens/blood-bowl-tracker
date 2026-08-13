import { DbModule } from '@blood-bowl-tracker/db';
import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';

import { ReviewPlayerConfigModule } from './config/review-player-config.module';
import { ReviewPlayerConfigService } from './config/review-player-config.service';
import { HarnessModule } from './harness/harness.module';

@Module({})
export class AppModule {
  static register(): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ReviewPlayerConfigModule,
        DbModule.forRootAsync({
          useFactory: (config: ReviewPlayerConfigService) =>
            config.getDatabaseUrl(),
          inject: [ReviewPlayerConfigService],
        }),
        HarnessModule,
      ],
    };
  }
}
