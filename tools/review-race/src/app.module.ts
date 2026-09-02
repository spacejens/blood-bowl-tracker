import { createReviewAppModule } from '@blood-bowl-tracker/review-harness';
import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';

import { ReviewRaceConfigModule } from './config/review-race-config.module';
import { RaceReviewConfigService } from './config/review-race-config.service';
import { HarnessModule } from './harness/harness.module';

@Module({})
export class AppModule {
  static register(): DynamicModule {
    return createReviewAppModule({
      module: AppModule,
      configModule: ReviewRaceConfigModule,
      configService: RaceReviewConfigService,
      harnessModule: HarnessModule,
    });
  }
}
