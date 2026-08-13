import { createReviewAppModule } from '@blood-bowl-tracker/review-harness';
import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';

import { ReviewMatchConfigModule } from './config/review-match-config.module';
import { ReviewMatchConfigService } from './config/review-match-config.service';
import { HarnessModule } from './harness/harness.module';

@Module({})
export class AppModule {
  static register(): DynamicModule {
    return createReviewAppModule({
      module: AppModule,
      configModule: ReviewMatchConfigModule,
      configService: ReviewMatchConfigService,
      harnessModule: HarnessModule,
    });
  }
}
