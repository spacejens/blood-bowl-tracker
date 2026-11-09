import { Module } from '@nestjs/common';

import { TrophyAwardCountsService } from './trophy-award-counts.service';

@Module({
  providers: [TrophyAwardCountsService],
  exports: [TrophyAwardCountsService],
})
export class TrophyAwardCountsModule {}
