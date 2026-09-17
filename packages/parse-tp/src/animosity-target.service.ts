import { Injectable } from '@nestjs/common';

/**
 * The named target TP's `Animosity` skill (skillMasterId 269) is aimed at.
 *
 * TP publishes the target as an "attribute type 3" value -- an opaque numeric
 * code into TP's own position-keyword table, not a composable display value
 * (see `TpPositionSkillRef`). This map is a HARD-CODED, position-keyword
 * specific mapping of the two codes the downloaded mirror actually carries,
 * each confirmed against TP's own UI by the developer; it is documented in
 * docs/import-tp/index.md, "Hard-coded TP lookups". If TP's position-keyword
 * data is ever imported directly, that import should REPLACE this table
 * rather than sit alongside it.
 *
 * The importer applies this lookup only to skillMasterId 269 -- kept a
 * separate service from `HatredTargetService` (skillMasterId 307's own
 * table) rather than one shared type-3 decoder, so a code confirmed for one
 * skill can never be mistakenly applied to the other.
 *
 * Exported for `animosity-target.service.spec.ts`, so its decode tests are
 * driven directly off this map (every known code gets a test case, with no
 * risk of the two lists drifting apart).
 */
export const animosityTargetByCode: Record<number, string> = {
  111: 'Goblin',
  999: 'All',
};

@Injectable()
export class AnimosityTargetService {
  /**
   * The named target for one raw `attributeValue`, or `undefined` when the
   * table cannot explain it. Takes the raw string rather than a number
   * because that is the type TP's parsed reference carries; a value that is
   * not a whole number at all decodes to `undefined` like any other unknown.
   */
  decode(attributeValue: string): string | undefined {
    const code = Number(attributeValue);
    if (!Number.isInteger(code)) {
      return undefined;
    }
    return animosityTargetByCode[code];
  }
}
