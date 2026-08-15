import { Module } from '@nestjs/common';

import { TrophyAwardsService } from './trophy-awards.service';

@Module({
  providers: [TrophyAwardsService],
  exports: [TrophyAwardsService],
})
export class TrophyAwardsModule {}
