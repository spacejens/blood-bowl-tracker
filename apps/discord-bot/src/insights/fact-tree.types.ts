import type { FactScope } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';

import type { CoachToplistService } from './facts/coach-toplist.service';
import type { ErasListService } from './facts/eras-list.service';
import type { ExpensiveMistakesToplistService } from './facts/expensive-mistakes-toplist.service';
import type { PlayerToplistService } from './facts/player-toplist.service';
import type { RaceToplistService } from './facts/race-toplist.service';
import type { StatsSummaryFactsService } from './facts/stats-summary.service';
import type { TeamToplistService } from './facts/team-toplist.service';

/** `buildFactTree`'s dependency bag: the fact services it wires into leaves. */
export interface FactTreeDeps {
  coachToplist: CoachToplistService;
  teamToplist: TeamToplistService;
  playerToplist: PlayerToplistService;
  raceToplist: RaceToplistService;
  expensiveMistakes: ExpensiveMistakesToplistService;
  erasList: ErasListService;
  statsSummary: StatsSummaryFactsService;
}

export interface FactLeaf {
  supportsLeague: boolean;
  supportsEra: boolean;
  supportsCompetition: boolean;
  supportsMatchCategory: boolean;
  resolve: (scope: FactScope) => Promise<string | InteractionReplyOptions>;
}
export type FactNode = FactLeaf | { [segment: string]: FactNode };
