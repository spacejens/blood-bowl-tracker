import type { LearnableSkillCategory } from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

/**
 * TP's `skillNormal` / `skillDouble` bitmask: bit value -> category, in
 * ascending bit order. Inferred from every BB2020, DB2021 and BB2025
 * official-list position and confirmed against the physical rulebooks (Human
 * Lineman 2/17 reads primary General, secondary Agility + Strength). Bit 128
 * (Devious) occurs only under BB2025.
 *
 * Bits 32 and 64 occur on no position at all. They may stand for trait and
 * unique, but nothing confirms that, and neither could be a position's
 * primary or secondary category anyway. They are treated as unknown, like
 * any other unlisted bit.
 */
const SKILL_CATEGORY_BITS: readonly (readonly [
  number,
  LearnableSkillCategory,
])[] = [
  [1, 'agility'],
  [2, 'general'],
  [4, 'mutation'],
  [8, 'passing'],
  [16, 'strength'],
  [128, 'devious'],
];

const KNOWN_BITS = SKILL_CATEGORY_BITS.reduce((all, [bit]) => all | bit, 0);

/** The highest mask whose bits all fit the known 8-bit range. */
const MAX_IN_RANGE_MASK = 0xff;

/**
 * Decodes one of TP's skill category bitmasks into the categories it names.
 * An unknown bit throws rather than being dropped, so a TP change that adds
 * a bit makes that file's import fail visibly instead of silently recording
 * a partial set.
 */
@Injectable()
export class TpSkillCategoryMaskDecoderService {
  decode(mask: number): LearnableSkillCategory[] {
    // Checked before any bitwise operator, which would truncate the mask to
    // 32 bits and could hide high bits (2 ** 32 would decode as empty).
    if (!Number.isSafeInteger(mask) || mask < 0 || mask > MAX_IN_RANGE_MASK) {
      throw new Error(
        `TP skill category mask ${mask} sets unknown bit(s) outside the known range 0-${MAX_IN_RANGE_MASK}`,
      );
    }
    const unknown = mask & ~KNOWN_BITS;
    if (unknown !== 0) {
      throw new Error(
        `TP skill category mask ${mask} sets unknown bit(s) ${this.bitsOf(unknown).join(', ')}`,
      );
    }
    return SKILL_CATEGORY_BITS.filter(([bit]) => (mask & bit) !== 0).map(
      ([, category]) => category,
    );
  }

  /** The set bits of a non-negative in-range mask, ascending. */
  private bitsOf(mask: number): number[] {
    const bits: number[] = [];
    for (let bit = 1; bit <= mask; bit *= 2) {
      if ((mask & bit) !== 0) {
        bits.push(bit);
      }
    }
    return bits;
  }
}
