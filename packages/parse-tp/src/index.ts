export { AwardsParserService } from './awards-parser.service';
export type { TpCoach } from './inscriptions-parser.service';
export { InscriptionsParserService } from './inscriptions-parser.service';
// Exported for direct construction (tests); not in ParseTpModule.exports — nothing outside this package injects it via DI.
export { MatchEventDecodersService } from './match-event-decoders.service';
export type {
  TpInducedStarPlayer,
  TpInjuryType,
  TpMatchEvent,
} from './match-event-parser.service';
export { MatchEventParserService } from './match-event-parser.service';
export type { TpMatch } from './match-parser.service';
export { MatchParserService } from './match-parser.service';
export { OfficialTeamsParserService } from './official-teams-parser.service';
export { ParseTpModule } from './parse-tp.module';
export type {
  TpFixture,
  TpPhaseFixtures,
} from './phase-fixtures-parser.service';
export { PhaseFixturesParserService } from './phase-fixtures-parser.service';
export type {
  TpCareerSppCounts,
  TpGainedSkillRef,
  TpPlayerCharacteristics,
  TpPlayerSkillRef,
  TpPlayerSkills,
  TpRoster,
  TpRosterPlayer,
  TpRosterPosition,
} from './roster-parser.service';
export { RosterParserService } from './roster-parser.service';
// Exported for direct construction (tests); not in ParseTpModule.exports — nothing outside this package injects it via DI.
export { SecretObjectiveService } from './secret-objective.service';
export type { TpSkillMaster } from './skill-master-names-parser.service';
export { SkillMasterNamesParserService } from './skill-master-names-parser.service';
export type {
  TpTournament,
  TpTournamentPhase,
} from './tournament-parser.service';
export { TournamentParserService } from './tournament-parser.service';
export type {
  TpOfficialListing,
  TpOfficialListingPrecedenceOptions,
} from './tp-official-listing-precedence.service';
export { TpOfficialListingPrecedenceService } from './tp-official-listing-precedence.service';
export type { TpStarHireKeyOptions } from './tp-star-hire-key.service';
export { TpStarHireKeyService } from './tp-star-hire-key.service';
// Exported for direct construction (tests); not in ParseTpModule.exports — nothing outside this package injects it via DI.
export { WeatherTypeService } from './weather-type.service';
