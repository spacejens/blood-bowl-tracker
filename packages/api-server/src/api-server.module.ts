import { Module } from '@nestjs/common';
import { ORPCModule } from '@orpc/nest';
import { CoachesModule } from './coaches/coaches.module';
import { RacesModule } from './races/races.module';
import { RulesSetsModule } from './rules-sets/rules-sets.module';
import { LeaguesModule } from './leagues/leagues.module';
import { PositionsModule } from './positions/positions.module';
import { ErasModule } from './eras/eras.module';
import { CompetitionsModule } from './competitions/competitions.module';
import { TeamsModule } from './teams/teams.module';
import { TeamErasModule } from './team-eras/team-eras.module';
import { PlayersModule } from './players/players.module';
import { MatchesModule } from './matches/matches.module';
import { MatchEventsModule } from './match-events/match-events.module';
import { RaceRulesSetsModule } from './race-rules-sets/race-rules-sets.module';
import { CompetitionTeamsModule } from './competition-teams/competition-teams.module';
import { MatchTeamsModule } from './match-teams/match-teams.module';
import { ExternalSystemsModule } from './external-systems/external-systems.module';

@Module({
  imports: [
    ORPCModule.forRoot({}),
    CoachesModule,
    RacesModule,
    RulesSetsModule,
    LeaguesModule,
    PositionsModule,
    ErasModule,
    CompetitionsModule,
    TeamsModule,
    TeamErasModule,
    PlayersModule,
    MatchesModule,
    MatchEventsModule,
    RaceRulesSetsModule,
    CompetitionTeamsModule,
    MatchTeamsModule,
    ExternalSystemsModule,
  ],
})
export class ApiServerModule {}
