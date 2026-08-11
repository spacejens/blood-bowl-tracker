import { Module } from '@nestjs/common';

import { SppModule } from '../spp/spp.module';
import { MatchEventsService } from './match-events.service';

@Module({
  imports: [SppModule],
  providers: [MatchEventsService],
  exports: [MatchEventsService],
})
export class MatchEventsModule {}
