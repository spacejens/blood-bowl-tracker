import { createReviewAppModule } from '@blood-bowl-tracker/review-harness';
import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';

import { ReviewStarPlayerConfigModule } from './config/review-star-player-config.module';
import { StarPlayerReviewConfigService } from './config/review-star-player-config.service';
import { HarnessModule } from './harness/harness.module';

@Module({})
export class AppModule {
  static register(): DynamicModule {
    return createReviewAppModule({
      module: AppModule,
      configModule: ReviewStarPlayerConfigModule,
      configService: StarPlayerReviewConfigService,
      harnessModule: HarnessModule,
    });
  }
}
