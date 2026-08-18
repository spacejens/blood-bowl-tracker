import { Injectable } from '@nestjs/common';

import { buildFactTree } from './fact-tree';
import type { FactNode } from './fact-tree.types';
import { CoachToplistService } from './facts/coach-toplist.service';
import { CompetitionGroupsListService } from './facts/competition-groups-list.service';
import { ErasListService } from './facts/eras-list.service';
import { ExpensiveMistakesToplistService } from './facts/expensive-mistakes-toplist.service';
import { PlayerToplistService } from './facts/player-toplist.service';
import { RaceToplistService } from './facts/race-toplist.service';
import { StatsSummaryFactsService } from './facts/stats-summary.service';
import { TeamToplistService } from './facts/team-toplist.service';
import { TrophiesListService } from './facts/trophies-list.service';

/**
 * Wraps the pure `buildFactTree()` in a Nest provider so the assembled fact
 * tree can be supplied through DI (the `FACT_TREE` token) rather than composed
 * inside `InsightsCommandService`'s constructor. The many-arg constructor is
 * allowed: NestJS DI constructors are exempt from the max-params rule.
 */
@Injectable()
export class FactTreeFactoryService {
  constructor(
    private readonly coachToplist: CoachToplistService,
    private readonly teamToplist: TeamToplistService,
    private readonly playerToplist: PlayerToplistService,
    private readonly raceToplist: RaceToplistService,
    private readonly expensiveMistakes: ExpensiveMistakesToplistService,
    private readonly erasList: ErasListService,
    private readonly competitionGroupsList: CompetitionGroupsListService,
    private readonly statsSummary: StatsSummaryFactsService,
    private readonly trophiesList: TrophiesListService,
  ) {}

  build(): FactNode {
    return buildFactTree({
      coachToplist: this.coachToplist,
      teamToplist: this.teamToplist,
      playerToplist: this.playerToplist,
      raceToplist: this.raceToplist,
      expensiveMistakes: this.expensiveMistakes,
      erasList: this.erasList,
      competitionGroupsList: this.competitionGroupsList,
      statsSummary: this.statsSummary,
      trophiesList: this.trophiesList,
    });
  }
}
