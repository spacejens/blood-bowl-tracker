import { Injectable } from '@nestjs/common';

/**
 * The named target TP's `Hatred` skill (skillMasterId 307) is aimed at.
 *
 * TP publishes the target as an "attribute type 3" value -- an opaque numeric
 * code into TP's own position-keyword table, not a composable display value
 * (see `TpPositionSkillRef`). This map is a HARD-CODED, position-keyword
 * specific mapping of the six codes the downloaded mirror actually carries,
 * each confirmed against TP's own UI by the developer; it is documented in
 * docs/import-tp/index.md, "Hatred target codes". If TP's position-keyword
 * data is ever imported directly, that import should REPLACE this table
 * rather than sit alongside it.
 *
 * Only codes confirmed to belong to the keyword space may ever be added
 * here. The importer applies this lookup to any type-3 reference, not only
 * to skillMasterId 307, so a code added speculatively could mislabel a
 * different skill's value. The other type-3 values the mirror carries today
 * (`111` and `999`, both on Animosity) are deliberately absent, so no such
 * collision exists at present.
 *
 * Exported for `hatred-target.service.spec.ts`, so its decode tests are
 * driven directly off this map (every known code gets a test case, with no
 * risk of the two lists drifting apart).
 */
export const hatredTargetByCode: Record<number, string> = {
  100: 'Dwarf',
  102: 'Troll',
  108: 'Vampire',
  110: 'Undead',
  134: 'Big Guy',
  1001: 'Daemon',
};

@Injectable()
export class HatredTargetService {
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
    return hatredTargetByCode[code];
  }
}
