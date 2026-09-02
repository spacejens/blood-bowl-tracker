export type { TpAward } from './awards-parser.service';
export { AwardsParserService } from './awards-parser.service';
export type { TpCoach } from './inscriptions-parser.service';
export { InscriptionsParserService } from './inscriptions-parser.service';
// Exported for direct construction (tests); not in ParseTpModule.exports — nothing outside this package injects it via DI.
export { MatchEventDecodersService } from './match-event-decoders.service';
export type {
  SecretObjective,
  TpInducedStarPlayer,
  TpInjuryType,
  TpMatchEvent,
  WeatherType,
} from './match-event-parser.service';
export { MatchEventParserService } from './match-event-parser.service';
export type { TpMatch } from './match-parser.service';
export { MatchParserService } from './match-parser.service';
export { ParseTpModule } from './parse-tp.module';
export type {
  TpCareerSppCounts,
  TpPlayerCharacteristics,
  TpPositionCharacteristics,
  TpRoster,
  TpRosterPlayer,
  TpRosterPosition,
} from './roster-parser.service';
export { RosterParserService } from './roster-parser.service';
// Exported for direct construction (tests); not in ParseTpModule.exports — nothing outside this package injects it via DI.
export { SecretObjectiveService } from './secret-objective.service';
export type { TpTournament } from './tournament-parser.service';
export { TournamentParserService } from './tournament-parser.service';
// Exported for direct construction (tests); not in ParseTpModule.exports — nothing outside this package injects it via DI.
export { WeatherTypeService } from './weather-type.service';
