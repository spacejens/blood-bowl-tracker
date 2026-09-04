import type { CharacteristicFormat } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

/**
 * BBL's mirror only ever displays Agility and Armour in BB2020's
 * roll-to-beat notation — the value these two methods receive as
 * `rawAgility`/`rawArmour` is always that BB2020-notation number, whatever
 * rules set the player or position actually played under. These methods
 * rewrite it into the notation the target rules set declares, so a
 * pre-BB2020 row stores the value that rules set would itself have written.
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
   * BB2020 Agility states the target a single D6 roll has to meet; pre-BB2020
   * Agility is a plain number on a complementary scale where the two always
   * sum to 6 — new 2+ is old AG 4, new 3+ is old AG 3, new 4+ is old AG 2.
   * Unclamped: BB2020's own 2+ floor (a natural 1 always fails) means the
   * scraped input is never low enough to need one here.
   *
   * `plus` (already BB2020 notation) and `absent` are both returned
   * unchanged — this method only decides notation, not whether the
   * characteristic is meaningful for the rules set.
   */
  convertAgility(rawAgility: number, format: CharacteristicFormat): number {
    if (format !== 'bare') {
      return rawAgility;
    }
    return 6 - rawAgility;
  }

  /**
   * BB2020 Armour states the minimum 2D6 roll that breaks it; pre-BB2020
   * Armour is the value a roll had to come out *above* to break, one lower.
   * BB2020 8+ is the same defense as old AV 7.
   */
  convertArmour(rawArmour: number, format: CharacteristicFormat): number {
    if (format !== 'bare') {
      return rawArmour;
    }
    return rawArmour - 1;
  }
}
