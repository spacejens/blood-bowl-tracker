import type { UpsertPlayer } from '@blood-bowl-tracker/api-contract';
import { PLAYER_LASTING_INJURY_KEYS } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import { LastingInjuryValidationError } from '../shared/lasting-injury-validation-error';

/** The six lasting-injury fields that carry a count, rather than a boolean. */
const COUNT_KEYS = [
  'nigglingInjuryCount',
  'moveReductionCount',
  'strengthReductionCount',
  'agilityReductionCount',
  'passingReductionCount',
  'armourReductionCount',
] as const satisfies readonly (typeof PLAYER_LASTING_INJURY_KEYS)[number][];

/**
 * The lasting-injury half of `players.upsert`'s input validation: reject a
 * partial lasting-injury line, and reject a negative or non-integer count —
 * both before any write happens.
 *
 * Unlike `PlayerCharacteristicsValidationService`, this needs no rules-set
 * lookup — there is no per-rules-set format to validate a count against — so
 * it is pure and dependency-free: no constructor, no DB access.
 */
@Injectable()
export class PlayerLastingInjuryValidationService {
  /**
   * The contract's `UpsertPlayerSchema` already guarantees the all-or-nothing
   * pairing and nonnegative-integer shape at the RPC boundary, but
   * `PlayersService` is also called directly, so a half-specified or
   * malformed payload is refused here rather than written as an unvalidated
   * partial line.
   */
  validate(data: UpsertPlayer): void {
    const supplied = PLAYER_LASTING_INJURY_KEYS.filter(
      (key) => data[key] !== undefined,
    );
    if (
      supplied.length > 0 &&
      supplied.length < PLAYER_LASTING_INJURY_KEYS.length
    ) {
      throw new LastingInjuryValidationError(
        `Lasting injuries are all-or-nothing: a partial lasting-injury line was supplied for ${this.playerSubject(data)} — supply every one of ${PLAYER_LASTING_INJURY_KEYS.join(', ')} or none`,
      );
    }
    if (supplied.length === 0) {
      return;
    }

    for (const key of COUNT_KEYS) {
      const value = data[key];
      if (value === undefined) {
        continue;
      }
      if (!Number.isInteger(value) || value < 0) {
        throw new LastingInjuryValidationError(
          `${key} must be a nonnegative integer for ${this.playerSubject(data)}, got ${value}`,
        );
      }
    }
  }

  /**
   * Names the player in a validation message. The row may not exist yet, so
   * the first external id is the only stable identifier available — and it is
   * the one the importer reporting the failure recognizes.
   */
  private playerSubject(data: UpsertPlayer): string {
    const [first] = data.externalIds;
    return `player ${first.externalSystemId}:${first.externalId}`;
  }
}
