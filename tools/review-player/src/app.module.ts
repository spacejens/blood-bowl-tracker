import { createReviewAppModule } from '@blood-bowl-tracker/review-harness';
import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';

import { ReviewPlayerConfigModule } from './config/review-player-config.module';
import { ReviewPlayerConfigService } from './config/review-player-config.service';
import { HarnessModule } from './harness/harness.module';

@Module({})
export class AppModule {
  static register(): DynamicModule {
    return createReviewAppModule({
      module: AppModule,
      configModule: ReviewPlayerConfigModule,
      configService: ReviewPlayerConfigService,
      harnessModule: HarnessModule,
    });
  }
}
