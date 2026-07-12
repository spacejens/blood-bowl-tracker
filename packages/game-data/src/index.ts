export { CoachesModule } from './coaches/coaches.module';
export type { UpsertCoachData } from './coaches/coaches.service';
export {
  CoachesService,
  CoachUpsertConflictError,
} from './coaches/coaches.service';
export { CompetitionsModule } from './competitions/competitions.module';
export type {
  CompetitionWithTeamEras,
  UpsertCompetitionData,
} from './competitions/competitions.service';
export {
  CompetitionsService,
  CompetitionUpsertConflictError,
} from './competitions/competitions.service';
export { ErasModule } from './eras/eras.module';
export type { UpsertEraData } from './eras/eras.service';
export { ErasService, EraUpsertConflictError } from './eras/eras.service';
export { ExternalSystemsModule } from './external-systems/external-systems.module';
export { ExternalSystemsService } from './external-systems/external-systems.service';
export { LeaguesModule } from './leagues/leagues.module';
export type { UpsertLeagueData } from './leagues/leagues.service';
export {
  LeaguesService,
  LeagueUpsertConflictError,
} from './leagues/leagues.service';
export { MatchesModule } from './matches/matches.module';
export type { UpsertMatchData } from './matches/matches.service';
export {
  MatchesService,
  MatchUpsertConflictError,
} from './matches/matches.service';
export { PlayersModule } from './players/players.module';
export type { UpsertPlayerData } from './players/players.service';
export {
  PlayersService,
  PlayerUpsertConflictError,
} from './players/players.service';
export { PositionsModule } from './positions/positions.module';
export type {
  PositionWithRaces,
  UpsertPositionData,
} from './positions/positions.service';
export {
  PositionsService,
  PositionUpsertConflictError,
} from './positions/positions.service';
export { RacesModule } from './races/races.module';
export type { UpsertRaceData } from './races/races.service';
export { RacesService, RaceUpsertConflictError } from './races/races.service';
export { RulesSetsModule } from './rules-sets/rules-sets.module';
export type {
  RulesSetWithRaces,
  UpsertRulesSetData,
} from './rules-sets/rules-sets.service';
export {
  RulesSetsService,
  RulesSetUpsertConflictError,
} from './rules-sets/rules-sets.service';
export { TeamsModule } from './teams/teams.module';
export type { TeamWithEras, UpsertTeamData } from './teams/teams.service';
export { TeamsService, TeamUpsertConflictError } from './teams/teams.service';
