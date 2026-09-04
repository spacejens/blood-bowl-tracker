import type { CharacteristicFormat } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

/**
 * BBL's mirror only ever displays Agility and Armour in BB2020's
 * roll-to-beat notation, whatever rules set the player or position actually
 * played under. These two methods rewrite such a value into the notation a
 * given rules set declares, so a pre-BB2020 row stores the value that rules
 * set would have written.
 *
 * The decision is data-driven: it is the target rules set's own
 * `agilityFormat` / `armourFormat` that says which notation applies, so no
 * list of "old" rules sets has to be maintained here.
 *
 * Pure and dependency-free by design (no constructor, no I/O), so specs may
 * pass it as a real provider — see CLAUDE.md, "Testing services".
 */
@Injectable()
export class CharacteristicNotationConversionService {
  /**
   * Pre-BB2020 Agility is a plain number rolled on a single D6; BB2020 states
   * the target the roll has to meet instead. Old AG 4 is the same as 2+, old
   * AG 3 the same as 3+. Clamped to a 2+ floor: a natural 1 always fails
   * under every rules set, so 1+ is not a value BB2020 notation can express.
   *
   * `plus` (already BB2020 notation) and `absent` are both returned
   * unchanged — this method only decides notation, not whether the
   * characteristic is meaningful for the rules set.
   */
  convertAgility(rawAgility: number, format: CharacteristicFormat): number {
    if (format !== 'bare') {
      return rawAgility;
    }
    return Math.max(2, 7 - rawAgility);
  }

  /**
   * Pre-BB2020 Armour is the 2D6 value a roll had to come out *above* to
   * break; BB2020 states the minimum roll that breaks it, one higher. Old AV
   * 7 is the same defense as 8+. Unclamped: realistic armour values do not
   * approach a ceiling worth guarding.
   */
  convertArmour(rawArmour: number, format: CharacteristicFormat): number {
    if (format !== 'bare') {
      return rawArmour;
    }
    return rawArmour - 1;
  }
}
