import { Injectable } from '@nestjs/common';

import { buildFactTree } from './fact-tree';
import type { FactNode } from './fact-tree.types';
import { CoachToplistService } from './facts/coach-toplist.service';
import { CompetitionGroupsListService } from './facts/competition-groups-list.service';
import { DateToplistFactsService } from './facts/date-toplist.service';
import { ErasListService } from './facts/eras-list.service';
import { ExpensiveMistakesToplistService } from './facts/expensive-mistakes-toplist.service';
import { OnThisDateFactsService } from './facts/on-this-date.service';
import { PlayerToplistService } from './facts/player-toplist.service';
import { PositionToplistService } from './facts/position-toplist.service';
import { RaceToplistService } from './facts/race-toplist.service';
import { StarPlayerToplistService } from './facts/star-player-toplist.service';
import { StarPlayersListService } from './facts/star-players-list.service';
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
    private readonly dateToplist: DateToplistFactsService,
    private readonly teamToplist: TeamToplistService,
    private readonly playerToplist: PlayerToplistService,
    private readonly raceToplist: RaceToplistService,
    private readonly positionToplist: PositionToplistService,
    private readonly expensiveMistakes: ExpensiveMistakesToplistService,
    private readonly erasList: ErasListService,
    private readonly competitionGroupsList: CompetitionGroupsListService,
    private readonly statsSummary: StatsSummaryFactsService,
    private readonly starPlayerToplist: StarPlayerToplistService,
    private readonly starPlayersList: StarPlayersListService,
    private readonly trophiesList: TrophiesListService,
    private readonly onThisDate: OnThisDateFactsService,
  ) {}

  build(): FactNode {
    return buildFactTree({
      coachToplist: this.coachToplist,
      dateToplist: this.dateToplist,
      teamToplist: this.teamToplist,
      playerToplist: this.playerToplist,
      raceToplist: this.raceToplist,
      positionToplist: this.positionToplist,
      expensiveMistakes: this.expensiveMistakes,
      erasList: this.erasList,
      competitionGroupsList: this.competitionGroupsList,
      statsSummary: this.statsSummary,
      starPlayerToplist: this.starPlayerToplist,
      starPlayersList: this.starPlayersList,
      trophiesList: this.trophiesList,
      onThisDate: this.onThisDate,
    });
  }
}
