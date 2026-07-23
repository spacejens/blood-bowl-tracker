import type {
  CoachesService,
  CompetitionsService,
  ErasService,
  ExternalSystemsService,
  FactScope,
  LeaguesService,
  MatchesService,
  PlayersService,
  PositionsService,
  RacesService,
  RulesSetsService,
  TeamsService,
} from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';

/**
 * `buildFactTree`'s dependency bag. Stopgap until Task 12 rewires
 * `FactTreeFactoryService` to inject the converted fact services directly
 * instead of assembling this bag of raw game-data services.
 */
export interface StatsSummaryDeps {
  leagues: LeaguesService;
  externalSystems: ExternalSystemsService;
  rulesSets: RulesSetsService;
  races: RacesService;
  positions: PositionsService;
  coaches: CoachesService;
  eras: ErasService;
  competitions: CompetitionsService;
  teams: TeamsService;
  players: PlayersService;
  matches: MatchesService;
}

export interface FactLeaf {
  supportsLeague: boolean;
  supportsEra: boolean;
  supportsCompetition: boolean;
  resolve: (scope: FactScope) => Promise<string | InteractionReplyOptions>;
}
export type FactNode = FactLeaf | { [segment: string]: FactNode };
