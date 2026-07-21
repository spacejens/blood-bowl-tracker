import {
  CoachesService,
  CompetitionsService,
  ErasService,
  ExternalSystemsService,
  LeaguesService,
  MatchesService,
  PlayersService,
  PositionsService,
  RacesService,
  RulesSetsService,
  TeamsService,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

import { buildFactTree } from './fact-tree';
import type { FactNode } from './fact-tree-utils';

/**
 * Wraps the pure `buildFactTree()` in a Nest provider so the assembled fact
 * tree can be supplied through DI (the `FACT_TREE` token) rather than composed
 * inside `InsightsCommandService`'s constructor. The many-arg constructor is
 * allowed: NestJS DI constructors are exempt from the max-params rule.
 */
@Injectable()
export class FactTreeFactoryService {
  constructor(
    private readonly coaches: CoachesService,
    private readonly teams: TeamsService,
    private readonly matches: MatchesService,
    private readonly competitions: CompetitionsService,
    private readonly leagues: LeaguesService,
    private readonly rulesSets: RulesSetsService,
    private readonly eras: ErasService,
    private readonly players: PlayersService,
    private readonly positions: PositionsService,
    private readonly races: RacesService,
    private readonly externalSystems: ExternalSystemsService,
  ) {}

  build(): FactNode {
    return buildFactTree({
      coaches: this.coaches,
      teams: this.teams,
      matches: this.matches,
      competitions: this.competitions,
      leagues: this.leagues,
      rulesSets: this.rulesSets,
      eras: this.eras,
      players: this.players,
      positions: this.positions,
      races: this.races,
      externalSystems: this.externalSystems,
    });
  }
}
