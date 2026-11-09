import { Module } from '@nestjs/common';

import { TeamRaceCoachNamesService } from './team-race-coach-names.service';

@Module({
  providers: [TeamRaceCoachNamesService],
  exports: [TeamRaceCoachNamesService],
})
export class TeamRaceCoachNamesModule {}
