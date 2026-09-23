import { Module } from '@nestjs/common';

import { TpRosterPathsService } from './tp-roster-paths.service';

@Module({
  providers: [TpRosterPathsService],
  exports: [TpRosterPathsService],
})
export class TpRosterPathsModule {}
