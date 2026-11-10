import { Module } from '@nestjs/common';

import { TrophyAwardsQueriesService } from './trophy-awards-queries.service';

@Module({
  providers: [TrophyAwardsQueriesService],
  exports: [TrophyAwardsQueriesService],
})
export class TrophyAwardsQueriesModule {}
