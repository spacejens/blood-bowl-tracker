import type { SppCareerCounts } from '@blood-bowl-tracker/api-contract';
import { SPP_CAREER_COUNT_KEYS } from '@blood-bowl-tracker/api-contract';
import type {
  TpCareerSppCounts,
  TpPlayerSkills,
} from '@blood-bowl-tracker/parse-tp';
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
  /** Each imported roster player's own skills, for the player-skills sync. */
  skillsByPlayerId: Map<number, TpPlayerSkills>;
  /** Each imported roster player's career action counts, for SPP adjustments. */
  careerSppCountsByPlayerId: Map<number, SppCareerCounts>;
}

@Injectable()
export class TpRosterPlayerFactsService {
  /**
   * Reads skills and career SPP counts off the parsed roster files for every
   * player the roster import upserted. Only a standalone roster file carries
   * either (a match snapshot has neither), so match-snapshot-only players get
   * none. A career counter only ever grows, so each is the highest value any
   * roster file reported; skills take the last roster file listing the
   * player, and the skills sync never deletes, so an earlier file's skills
   * survive on a warm database.
   */
  collect({
    rosters,
    playerIdsByLineUpId,
  }: CollectRosterPlayerFactsOptions): RosterPlayerFacts {
    const skillsByPlayerId = new Map<number, TpPlayerSkills>();
    const careerSppCountsByPlayerId = new Map<number, SppCareerCounts>();
    for (const { roster } of rosters) {
      for (const player of roster.players) {
        const playerId = playerIdsByLineUpId.get(player.id);
        if (playerId === undefined) {
          continue;
        }
        if (player.skills !== undefined) {
          skillsByPlayerId.set(playerId, player.skills);
        }
        if (player.careerCounts !== undefined) {
          this.noteCareerCounts({
            byPlayerId: careerSppCountsByPlayerId,
            playerId,
            counts: player.careerCounts,
          });
        }
      }
    }
    return { skillsByPlayerId, careerSppCountsByPlayerId };
  }

  private noteCareerCounts(options: {
    byPlayerId: Map<number, SppCareerCounts>;
    playerId: number;
    counts: TpCareerSppCounts;
  }): void {
    const { byPlayerId, playerId, counts } = options;
    const mapped: SppCareerCounts = {
      touchdown: counts.touchdowns,
      completion: counts.completions,
      // TP reports one combined interception counter (no deflection field)
      // and one combined casualty counter (no severity breakdown); both are
      // priced with a single representative award value server-side.
      interception: counts.interceptions,
      mvp_award: counts.mvpAwards,
      casualty: counts.casualties,
    };
    const existing = byPlayerId.get(playerId);
    if (existing === undefined) {
      byPlayerId.set(playerId, mapped);
      return;
    }
    for (const group of SPP_CAREER_COUNT_KEYS) {
      existing[group] = Math.max(existing[group], mapped[group]);
    }
  }
}
