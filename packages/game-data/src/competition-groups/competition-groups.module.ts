import { Module } from '@nestjs/common';

import { CompetitionGroupsService } from './competition-groups.service';

@Module({
  providers: [CompetitionGroupsService],
  exports: [CompetitionGroupsService],
})
export class CompetitionGroupsModule {}
