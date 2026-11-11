import type {
  SppCareerCounts,
  TpImportedPlayer,
  UnspentSppSnapshot,
} from '@blood-bowl-tracker/api-contract';
import type { TpRoster } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

/**
 * What the SPP adjustments sync needs to know about one imported player:
 * its DB id, the career SPP total TP reports for it, and TP's career action
 * counts when the standalone roster carried them. A player seen only in a
 * match's roster snapshot has no counts; one TP reports no total for is
 * skipped by the sync.
 */
export interface TpLivePlayerSppFacts {
  playerId: number;
  reportedSppTotal?: number;
  careerCounts?: SppCareerCounts;
  /**
   * TP's unspent figure with the total from the same roster or match entry;
   * absent when no entry of the player carries a figure.
   */
  unspentSppSnapshot?: UnspentSppSnapshot;
}

/** Options for {@link TpPlayerSppFactsService.collect}. */
export interface CollectPlayerSppFactsOptions {
  /** The parsed standalone roster the players were imported from. */
  roster: TpRoster;
  /** Every player the roster import upserted, by TP `lineUps[].id`. */
  importedPlayers: TpImportedPlayer[];
}

/**
 * Builds the SPP facts of one live team import's players: the live
 * counterpart of tools/import-tp's `TpRosterPlayerFactsService`, passing on the
 * career counters the roster parser already names with the groups the server
 * prices. Pure, with no
 * dependencies.
 */
@Injectable()
export class TpPlayerSppFactsService {
  collect({
    roster,
    importedPlayers,
  }: CollectPlayerSppFactsOptions): TpLivePlayerSppFacts[] {
    const countsByLineUpId = new Map<number, SppCareerCounts>();
    for (const player of roster.players) {
      if (player.careerCounts !== undefined) {
        countsByLineUpId.set(player.id, player.careerCounts);
      }
    }
    return importedPlayers.map(
      ({ lineUpId, playerId, reportedSppTotal, unspentSppSnapshot }) => {
        const counts = countsByLineUpId.get(lineUpId);
        const snapshot =
          unspentSppSnapshot === undefined ? {} : { unspentSppSnapshot };
        return counts === undefined
          ? { playerId, reportedSppTotal, ...snapshot }
          : {
              playerId,
              reportedSppTotal,
              careerCounts: counts,
              ...snapshot,
            };
      },
    );
  }
}
