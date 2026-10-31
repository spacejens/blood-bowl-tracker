import type { TpMatchEmbeddedPlayer } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

/**
 * What is kept of one player's match-embedded entries: the freshest entry
 * overall (player state, name, position) and, separately, the freshest entry
 * that carries an unspent figure, so the figure stays paired with its own
 * entry's career total.
 */
export interface FreshestMatchEntries {
  latest: TpMatchEmbeddedPlayer;
  withUnspent?: TpMatchEmbeddedPlayer;
}

@Injectable()
export class TpMatchEmbeddedPlayerFreshnessService {
  /**
   * Folds one more match-embedded entry into the per-player map. Every entry
   * shows the player as of the download, not as of its match, and a career
   * total only ever grows, so the higher total is the fresher entry. With
   * equal totals the lower unspent figure is fresher: unspent SPP can only
   * rise when the total rises, so at the same total a lower figure means a
   * skill was bought since. Ties on both keep the later entry.
   */
  accumulate(
    freshest: Map<number, FreshestMatchEntries>,
    candidate: TpMatchEmbeddedPlayer,
  ): void {
    const known = freshest.get(candidate.id);
    const withUnspent =
      candidate.starPlayerPoints === undefined
        ? known?.withUnspent
        : this.fresher(known?.withUnspent, candidate);
    freshest.set(candidate.id, {
      latest: this.fresher(known?.latest, candidate),
      ...(withUnspent === undefined ? {} : { withUnspent }),
    });
  }

  /**
   * The entries to hand on per player: the freshest unspent-carrying entry
   * first (when it is not also the freshest overall), then the freshest
   * entry, which wins for everything but the unspent figure.
   */
  entries(
    freshest: Map<number, FreshestMatchEntries>,
  ): TpMatchEmbeddedPlayer[] {
    return Array.from(freshest.values()).flatMap(({ latest, withUnspent }) =>
      withUnspent === undefined || withUnspent === latest
        ? [latest]
        : [withUnspent, latest],
    );
  }

  private fresher(
    known: TpMatchEmbeddedPlayer | undefined,
    candidate: TpMatchEmbeddedPlayer,
  ): TpMatchEmbeddedPlayer {
    if (known === undefined) {
      return candidate;
    }
    if (candidate.totalStarPlayerPoints !== known.totalStarPlayerPoints) {
      return candidate.totalStarPlayerPoints > known.totalStarPlayerPoints
        ? candidate
        : known;
    }
    return candidate.starPlayerPoints !== undefined &&
      known.starPlayerPoints !== undefined &&
      candidate.starPlayerPoints > known.starPlayerPoints
      ? known
      : candidate;
  }
}
