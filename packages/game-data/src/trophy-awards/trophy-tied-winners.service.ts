import { Injectable } from '@nestjs/common';

import type { TrophyRuleWinner } from './trophy-rule-types';

/**
 * One candidate row of a max-style trophy rule. `eventCount` is whatever
 * figure the rule ranks by: a count of matching events, or an SPP sum.
 */
export interface TiedWinnerCandidate {
  playerId: number;
  teamEraId: number;
  eventCount: number;
}

/**
 * The shared max/tie decision for max-style trophy rules.
 */
@Injectable()
export class TrophyTiedWinnersService {
  /**
   * The top figure wins, unless it is zero or more players share it than the
   * cutoff allows. `rows` must already be sorted by `eventCount` descending.
   */
  select(
    rows: readonly TiedWinnerCandidate[],
    tieCutoff: number,
  ): TrophyRuleWinner[] {
    const best = rows[0];
    if (best === undefined || best.eventCount < 1) {
      return [];
    }
    const winners = rows.filter((row) => row.eventCount === best.eventCount);
    if (winners.length > tieCutoff) {
      return [];
    }
    return winners.map((row) => ({
      playerId: row.playerId,
      teamEraId: row.teamEraId,
    }));
  }
}
