import type {
  CoversAnother,
  KnownUnspentSpp,
  UnspentSppResult,
  UnspentSppUnknownReason,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

import { NumberFormatterService } from '../../shared/number-formatter.service';

/** Why the figure is unknown, in plain words, per `UnspentSppService` reason. */
const UNKNOWN_REASONS: Record<UnspentSppUnknownReason, string> = {
  star_player: 'star players do not advance',
  no_rules_set: "no rules set for the player's era",
  no_costs: 'no advancement costs for the rules set',
  inconsistent_history: 'advancement history does not fit the rules',
  // The whole total section is absent without a total, so this cannot
  // normally show; it is mapped so every reason has words.
  no_total_spp: 'no total SPP',
};

/** The note for each verdict on whether the figure covers the next cost. */
const VERDICTS: Record<CoversAnother, string> = {
  yes: 'covers another advancement',
  maybe: 'may cover another advancement',
  no: 'not enough for another advancement',
};

/**
 * The player deepdive's `Unspent SPP:` line, from `UnspentSppService`'s
 * result. `null` is a lookup that timed out or failed: the line then reads as unknown
 * rather than costing the reader the rest of the deepdive.
 *
 * A figure is one number when the spend is exact, otherwise the least and
 * most it could be joined by an en dash. Nothing to spend (the largest
 * figure is 0 or less) shows the figure alone, a legitimate zero included.
 * Otherwise a bracketed note follows: "no further advancements" when none
 * exists, which takes precedence over the verdict, or the verdict itself.
 */
@Injectable()
export class UnspentSppLineService {
  constructor(private readonly numbers: NumberFormatterService) {}

  build(result: UnspentSppResult | null): string {
    if (result === null) {
      return 'Unspent SPP: unknown (lookup unavailable)';
    }
    if (result.status === 'unknown') {
      return `Unspent SPP: unknown (${UNKNOWN_REASONS[result.reason]})`;
    }
    const figure = this.figure(result);
    const note = this.note(result);
    return note === undefined
      ? `Unspent SPP: ${figure}`
      : `Unspent SPP: ${figure} (${note})`;
  }

  private figure({ unspentMin, unspentMax }: KnownUnspentSpp): string {
    return unspentMin === unspentMax
      ? this.numbers.count(unspentMin)
      : `${this.numbers.count(unspentMin)}–${this.numbers.count(unspentMax)}`;
  }

  private note(result: KnownUnspentSpp): string | undefined {
    if (result.unspentMax <= 0) {
      return undefined;
    }
    if (result.cheapestNextCost === null) {
      return 'no further advancements available';
    }
    return VERDICTS[result.coversAnother];
  }
}
