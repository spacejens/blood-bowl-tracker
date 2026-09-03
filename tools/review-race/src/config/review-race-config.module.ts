import { Global, Module } from '@nestjs/common';

import {
  DEFAULT_REVIEW_RACE_CONFIG_PATH,
  RaceReviewConfigService,
  REVIEW_RACE_CONFIG_PATH,
} from './review-race-config.service';

@Global()
@Module({
  providers: [
    {
      provide: REVIEW_RACE_CONFIG_PATH,
      useValue: DEFAULT_REVIEW_RACE_CONFIG_PATH,
    },
    RaceReviewConfigService,
  ],
  exports: [RaceReviewConfigService],
})
export class ReviewRaceConfigModule {}
