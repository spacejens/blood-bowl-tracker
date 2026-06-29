import { Module } from '@nestjs/common';
import { DbModule } from '@blood-bowl-tracker/db';
import { TeamsModule } from './teams/teams.module';
import { MatchesModule } from './matches/matches.module';
import { MatchEventsModule } from './match-events/match-events.module';

@Module({
  imports: [DbModule, TeamsModule, MatchesModule, MatchEventsModule],
})
export class ApiServerModule {}
