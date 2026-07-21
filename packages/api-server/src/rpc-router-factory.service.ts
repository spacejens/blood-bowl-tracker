import {
  CoachesService,
  CompetitionsService,
  ErasService,
  ExternalSystemsService,
  LeaguesService,
  MatchesService,
  MatchEventsService,
  PlayersService,
  PositionsService,
  RacesService,
  RulesSetsService,
  TeamsService,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

import { buildRpcRouter } from './rpc-router';

/**
 * Wraps the pure `buildRpcRouter()` in a Nest provider so the assembled oRPC
 * router can be supplied through DI (the `RPC_ROUTER` token) rather than
 * composed inside `RpcMiddleware`'s constructor. The many-arg constructor is
 * allowed: NestJS DI constructors are exempt from the max-params rule.
 */
@Injectable()
export class RpcRouterFactoryService {
  constructor(
    private readonly coachesService: CoachesService,
    private readonly externalSystemsService: ExternalSystemsService,
    private readonly leaguesService: LeaguesService,
    private readonly racesService: RacesService,
    private readonly rulesSetsService: RulesSetsService,
    private readonly erasService: ErasService,
    private readonly positionsService: PositionsService,
    private readonly teamsService: TeamsService,
    private readonly competitionsService: CompetitionsService,
    private readonly matchesService: MatchesService,
    private readonly playersService: PlayersService,
    private readonly matchEventsService: MatchEventsService,
  ) {}

  build(): ReturnType<typeof buildRpcRouter> {
    return buildRpcRouter({
      coachesService: this.coachesService,
      externalSystemsService: this.externalSystemsService,
      leaguesService: this.leaguesService,
      racesService: this.racesService,
      rulesSetsService: this.rulesSetsService,
      erasService: this.erasService,
      positionsService: this.positionsService,
      teamsService: this.teamsService,
      competitionsService: this.competitionsService,
      matchesService: this.matchesService,
      playersService: this.playersService,
      matchEventsService: this.matchEventsService,
    });
  }
}
