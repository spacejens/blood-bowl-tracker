import { Global, Module } from '@nestjs/common';

import {
  DEFAULT_REVIEW_PLAYER_CONFIG_PATH,
  REVIEW_PLAYER_CONFIG_PATH,
  ReviewPlayerConfigService,
} from './review-player-config.service';

@Global()
@Module({
  providers: [
    {
      provide: REVIEW_PLAYER_CONFIG_PATH,
      useValue: DEFAULT_REVIEW_PLAYER_CONFIG_PATH,
    },
    ReviewPlayerConfigService,
  ],
  exports: [ReviewPlayerConfigService],
})
export class ReviewPlayerConfigModule {}
