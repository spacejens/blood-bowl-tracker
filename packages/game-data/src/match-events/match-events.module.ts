import { Module } from '@nestjs/common';

import { MatchEventsService } from './match-events.service';

@Module({
  providers: [MatchEventsService],
  exports: [MatchEventsService],
})
export class MatchEventsModule {}
