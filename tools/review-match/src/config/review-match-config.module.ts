import { Global, Module } from '@nestjs/common';

import {
  DEFAULT_REVIEW_MATCH_CONFIG_PATH,
  REVIEW_MATCH_CONFIG_PATH,
  ReviewMatchConfigService,
} from './review-match-config.service';

@Global()
@Module({
  providers: [
    {
      provide: REVIEW_MATCH_CONFIG_PATH,
      useValue: DEFAULT_REVIEW_MATCH_CONFIG_PATH,
    },
    ReviewMatchConfigService,
  ],
  exports: [ReviewMatchConfigService],
})
export class ReviewMatchConfigModule {}
