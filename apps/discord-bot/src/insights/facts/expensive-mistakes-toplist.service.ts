import type { FactScope, TeamsService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { TEAM_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import {
  TEAM_TOPLIST_NO_DATA_MESSAGE,
  TEAM_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { LeaderboardService } from '../leaderboard.service';

/** Money rendered with a thousands separator and a `gp` suffix, e.g. `150,000 gp`. */
function gp(amount: number): string {
  return `${amount.toLocaleString('en-US')} gp`;
}

/**
 * Two hand-written resolvers (rather than the uniform makeToplistResolvers
 * shape) because each needs a custom `formatRow`: the totals list appends `gp`,
 * and the biggest-events list also appends the match date. Both rank in the
 * application layer via LeaderboardService's resolveToplist/topRanksWithTies.
 */
@Injectable()
export class ExpensiveMistakesToplistService {
  constructor(
    private readonly teams: TeamsService,
    private readonly leaderboard: LeaderboardService,
  ) {}

  private teamButtonId(row: { teamId: number }): string {
    return `${TEAM_BUTTON_CUSTOM_ID_PREFIX}${row.teamId}`;
  }

  resolveTotal(scope: FactScope): Promise<string | InteractionReplyOptions> {
    return this.leaderboard.resolveToplist({
      title: 'Teams by money lost to expensive mistakes',
      fetchRows: (limit) => this.teams.sumExpensiveMistakesByTeam(scope, limit),
      timeoutMessage: TEAM_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: TEAM_TOPLIST_NO_DATA_MESSAGE,
      buildCustomId: (row) => this.teamButtonId(row),
      formatRow: (row) => `${row.rank}. ${row.name} — ${gp(row.count)}`,
    });
  }

  resolveBiggest(scope: FactScope): Promise<string | InteractionReplyOptions> {
    return this.leaderboard.resolveToplist({
      title: 'Biggest expensive mistakes',
      fetchRows: (limit) =>
        this.teams.listBiggestExpensiveMistakes(scope, limit),
      timeoutMessage: TEAM_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: TEAM_TOPLIST_NO_DATA_MESSAGE,
      buildCustomId: (row) => this.teamButtonId(row),
      formatRow: (row) =>
        `${row.rank}. ${row.name} — ${gp(row.count)} (${row.date})`,
    });
  }
}
