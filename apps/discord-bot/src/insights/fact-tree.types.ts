import type { FactScope } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';

import type { CoachToplistService } from './facts/coach-toplist.service';
import type { CompetitionGroupsListService } from './facts/competition-groups-list.service';
import type { ErasListService } from './facts/eras-list.service';
import type { ExpensiveMistakesToplistService } from './facts/expensive-mistakes-toplist.service';
import type { OnThisDateFactsService } from './facts/on-this-date.service';
import type { PlayerToplistService } from './facts/player-toplist.service';
import type { RaceToplistService } from './facts/race-toplist.service';
import type { StarPlayerToplistService } from './facts/star-player-toplist.service';
import type { StarPlayersListService } from './facts/star-players-list.service';
import type { StatsSummaryFactsService } from './facts/stats-summary.service';
import type { TeamToplistService } from './facts/team-toplist.service';
import type { TrophiesListService } from './facts/trophies-list.service';

/** `buildFactTree`'s dependency bag: the fact services it wires into leaves. */
export interface FactTreeDeps {
  coachToplist: CoachToplistService;
  competitionGroupsList: CompetitionGroupsListService;
  teamToplist: TeamToplistService;
  playerToplist: PlayerToplistService;
  raceToplist: RaceToplistService;
  expensiveMistakes: ExpensiveMistakesToplistService;
  erasList: ErasListService;
  statsSummary: StatsSummaryFactsService;
  starPlayerToplist: StarPlayerToplistService;
  starPlayersList: StarPlayersListService;
  trophiesList: TrophiesListService;
  onThisDate: OnThisDateFactsService;
}

export interface FactLeaf {
  supportsLeague: boolean;
  supportsEra: boolean;
  supportsCompetition: boolean;
  supportsMatchCategory: boolean;
  resolve: (scope: FactScope) => Promise<string | InteractionReplyOptions>;
}
export type FactNode = FactLeaf | { [segment: string]: FactNode };
