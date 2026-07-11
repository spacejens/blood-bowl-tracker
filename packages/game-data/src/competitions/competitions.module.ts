import { Module } from '@nestjs/common';

import { CompetitionsService } from './competitions.service';

@Module({
  providers: [CompetitionsService],
  exports: [CompetitionsService],
})
export class CompetitionsModule {}
