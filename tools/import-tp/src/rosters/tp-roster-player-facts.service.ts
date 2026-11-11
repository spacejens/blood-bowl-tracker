import type { SppCareerCounts } from '@blood-bowl-tracker/api-contract';
import { SPP_CAREER_COUNT_KEYS } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import type { RosterEntry } from '../source/roster-collection.service';

/** Options for {@link TpRosterPlayerFactsService.collect}. */
export interface CollectRosterPlayerFactsOptions {
  rosters: RosterEntry[];
  /** DB player id by TP `lineUps[].id`, from the roster import. */
  playerIdsByLineUpId: Map<number, number>;
}

/** Per-player facts later bulk steps need, keyed by DB player id. */
export interface RosterPlayerFacts {
  /** Each imported roster player's career action counts, for SPP adjustments. */
  careerSppCountsByPlayerId: Map<number, SppCareerCounts>;
}

@Injectable()
export class TpRosterPlayerFactsService {
  /**
   * Reads career SPP counts off the parsed roster files for every player the
   * roster import upserted. Only a standalone roster file carries them (a
   * match snapshot does not), so match-snapshot-only players get none. A
   * career counter only ever grows, so each is the highest value any roster
   * file reported.
   */
  collect({
    rosters,
    playerIdsByLineUpId,
  }: CollectRosterPlayerFactsOptions): RosterPlayerFacts {
    const careerSppCountsByPlayerId = new Map<number, SppCareerCounts>();
    for (const { roster } of rosters) {
      for (const player of roster.players) {
        const playerId = playerIdsByLineUpId.get(player.id);
        if (playerId === undefined || player.careerCounts === undefined) {
          continue;
        }
        this.noteCareerCounts({
          byPlayerId: careerSppCountsByPlayerId,
          playerId,
          counts: player.careerCounts,
        });
      }
    }
    return { careerSppCountsByPlayerId };
  }

  /**
   * Records one roster file's counts for a player, keeping each group's
   * highest value across files. Stores a copy: the per-group maximum is
   * written into the stored object, which must not be the parsed roster's.
   */
  private noteCareerCounts(options: {
    byPlayerId: Map<number, SppCareerCounts>;
    playerId: number;
    counts: SppCareerCounts;
  }): void {
    const { byPlayerId, playerId, counts } = options;
    const existing = byPlayerId.get(playerId);
    if (existing === undefined) {
      byPlayerId.set(playerId, { ...counts });
      return;
    }
    for (const group of SPP_CAREER_COUNT_KEYS) {
      existing[group] = Math.max(existing[group], counts[group]);
    }
  }
}
