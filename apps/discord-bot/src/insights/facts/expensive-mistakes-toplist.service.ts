import type { MatchCategory } from '@blood-bowl-tracker/api-contract';
import type { FactScope } from '@blood-bowl-tracker/game-data';
import { TeamsService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { TEAM_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import {
  TEAM_TOPLIST_NO_DATA_MESSAGE,
  TEAM_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { LeaderboardService } from '../leaderboard.service';
import { MatchCategoryLabelService } from './match-category-label.service';

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
  private readonly teamLink = {
    customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
    entityId: (row: { teamId: number }) => row.teamId,
  };

  constructor(
    private readonly teams: TeamsService,
    private readonly leaderboard: LeaderboardService,
    private readonly categoryLabel: MatchCategoryLabelService,
  ) {}

  resolveTotal(scope: FactScope): Promise<string | InteractionReplyOptions> {
    return this.leaderboard.resolveToplist<{
      teamId: number;
      name: string;
      count: number;
    }>({
      title: 'Teams by money lost to expensive mistakes',
      fetchRows: (limit) => this.teams.sumExpensiveMistakesByTeam(scope, limit),
      timeoutMessage: TEAM_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: TEAM_TOPLIST_NO_DATA_MESSAGE,
      entityLink: this.teamLink,
      formatRow: (row) => `${row.rank}. ${row.name} — ${gp(row.count)}`,
    });
  }

  resolveBiggest(scope: FactScope): Promise<string | InteractionReplyOptions> {
    return this.leaderboard.resolveToplist<{
      teamId: number;
      name: string;
      count: number;
      date: string;
      category: MatchCategory;
    }>({
      title: 'Biggest expensive mistakes',
      fetchRows: (limit) =>
        this.teams.listBiggestExpensiveMistakes(scope, limit),
      timeoutMessage: TEAM_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: TEAM_TOPLIST_NO_DATA_MESSAGE,
      entityLink: this.teamLink,
      formatRow: (row) =>
        `${row.rank}. ${row.name} — ${gp(row.count)} (${this.suffix(row)})`,
    });
  }

  /**
   * The parenthesised suffix: the date alone for a routine match, or the
   * date plus the category for a knock-out stage. A normal match's line is
   * byte-for-byte what it was before categories existed.
   */
  private suffix(row: { date: string; category: MatchCategory }): string {
    return row.category === 'normal'
      ? row.date
      : `${row.date}, ${this.categoryLabel.label(row.category)}`;
  }
}
