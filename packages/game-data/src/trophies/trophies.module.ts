import { Module } from '@nestjs/common';

import { TrophiesService } from './trophies.service';

@Module({
  providers: [TrophiesService],
  exports: [TrophiesService],
})
export class TrophiesModule {}
