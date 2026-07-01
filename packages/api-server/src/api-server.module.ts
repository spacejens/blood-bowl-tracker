import { Module } from '@nestjs/common';
import { CoachesModule } from './coaches/coaches.module';
import { RacesModule } from './races/races.module';
import { RulesSetsModule } from './rules-sets/rules-sets.module';
import { LeaguesModule } from './leagues/leagues.module';
import { PositionsModule } from './positions/positions.module';
import { ErasModule } from './eras/eras.module';
import { CompetitionsModule } from './competitions/competitions.module';
import { TeamsModule } from './teams/teams.module';
import { PlayersModule } from './players/players.module';
import { MatchesModule } from './matches/matches.module';
import { MatchEventsModule } from './match-events/match-events.module';
import { RaceRulesSetsModule } from './race-rules-sets/race-rules-sets.module';
import { CompetitionTeamsModule } from './competition-teams/competition-teams.module';
import { MatchTeamsModule } from './match-teams/match-teams.module';

@Module({
  imports: [
    CoachesModule,
    RacesModule,
    RulesSetsModule,
    LeaguesModule,
    PositionsModule,
    ErasModule,
    CompetitionsModule,
    TeamsModule,
    PlayersModule,
    MatchesModule,
    MatchEventsModule,
    RaceRulesSetsModule,
    CompetitionTeamsModule,
    MatchTeamsModule,
  ],
})
export class ApiServerModule {}
