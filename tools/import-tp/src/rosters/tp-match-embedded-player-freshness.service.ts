import type { TpMatchEmbeddedPlayer } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

@Injectable()
export class TpMatchEmbeddedPlayerFreshnessService {
  /**
   * Of two match-embedded entries for one player, the fresher one. Every
   * entry shows the player as of the download, not as of its match, and a
   * career total only ever grows, so the higher total is the fresher entry;
   * the later one wins a tie. The unspent figure then comes from the same
   * entry as the total it was reported beside.
   */
  fresher(
    known: TpMatchEmbeddedPlayer | undefined,
    candidate: TpMatchEmbeddedPlayer,
  ): TpMatchEmbeddedPlayer {
    return known === undefined ||
      candidate.totalStarPlayerPoints >= known.totalStarPlayerPoints
      ? candidate
      : known;
  }
}
