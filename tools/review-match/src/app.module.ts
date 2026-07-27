import { DbModule } from '@blood-bowl-tracker/db';
import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';

import { ReviewMatchConfigModule } from './config/review-match-config.module';
import { ReviewMatchConfigService } from './config/review-match-config.service';
import { HarnessModule } from './harness/harness.module';

@Module({})
export class AppModule {
  static register(): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ReviewMatchConfigModule,
        DbModule.forRootAsync({
          useFactory: (config: ReviewMatchConfigService) =>
            config.getDatabaseUrl(),
          inject: [ReviewMatchConfigService],
        }),
        HarnessModule,
      ],
    };
  }
}
