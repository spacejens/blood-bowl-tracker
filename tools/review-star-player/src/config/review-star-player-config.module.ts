import { Global, Module } from '@nestjs/common';

import {
  DEFAULT_REVIEW_STAR_PLAYER_CONFIG_PATH,
  REVIEW_STAR_PLAYER_CONFIG_PATH,
  StarPlayerReviewConfigService,
} from './review-star-player-config.service';

@Global()
@Module({
  providers: [
    {
      provide: REVIEW_STAR_PLAYER_CONFIG_PATH,
      useValue: DEFAULT_REVIEW_STAR_PLAYER_CONFIG_PATH,
    },
    StarPlayerReviewConfigService,
  ],
  exports: [StarPlayerReviewConfigService],
})
export class ReviewStarPlayerConfigModule {}
