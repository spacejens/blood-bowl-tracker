import { Injectable } from '@nestjs/common';

/**
 * One skill reference parsed out of a BBL Skills cell: its bare name and, when
 * the entry carried a trailing parenthetical, the attribute value that
 * parenthetical held (e.g. "4+" for "Loner (4+)").
 */
export interface BblSkillRef {
  name: string;
  attributeValue?: string;
}

/**
 * Known garbled Skills-cell entries produced by real BBL scraping bugs (a
 * missing open paren, a missing comma joining two skills, and two half
 * fragments of a `<br>`-separated Stunty annotation torn apart by comma
 * splitting). Matched verbatim, after comma-splitting and normalizing, before
 * the generic parenthetical-splitting regex runs -- these are exact known
 * strings, not a pattern to generalize. `undefined` for an entry means "drop
 * it, emit nothing" (the two Stunty fragments carry no skill information; a
 * legitimate "Stunty" entry always appears earlier in the same list).
 */
const KNOWN_GARBLED_SKILL_ENTRIES: Record<string, BblSkillRef[] | undefined> = {
  'Secret Weapon 6+)': [{ name: 'Secret Weapon', attributeValue: '6+' }],
  'Leap Right Stuff': [{ name: 'Leap' }, { name: 'Right Stuff' }],
  'Really Stupid.Throw Team-Mate': [
    { name: 'Really Stupid' },
    { name: 'Throw Team-Mate' },
  ],
  "Stunty(Note: comes with Brick Far'th": [],
  'included in his price)': [],
};

/**
 * A trailing parenthetical value, e.g. `"Loner (4+)"` -> `"4+"`. The space
 * before the paren is optional: real BBL data also drops it entirely
 * (`"Loner(4+)"`, `"Mighty Blow(+1)"`), a separate scraping inconsistency
 * from the space-before-paren case.
 */
const PARENTHETICAL_VALUE = /^(.+?) ?\(([^()]+)\)$/;

/**
 * The one place BBL's Skills-cell convention lives: how a single comma-split
 * entry becomes zero, one, or two skill refs. Shared by the position page
 * parser and the player page parser so the two can never disagree about what
 * a trailing parenthetical means or which garbled entries are known.
 */
@Injectable()
export class SkillEntryService {
  /**
   * One comma-split Skills-cell entry resolved into zero, one, or two skill
   * refs. A known garbled BBL entry is matched first, verbatim; otherwise a
   * trailing parenthetical splits into `name`/`attributeValue`, and an entry
   * with no parenthetical passes through as a bare name.
   */
  resolveSkillRefs(entry: string): BblSkillRef[] {
    if (Object.hasOwn(KNOWN_GARBLED_SKILL_ENTRIES, entry)) {
      return KNOWN_GARBLED_SKILL_ENTRIES[entry] ?? [];
    }
    const match = PARENTHETICAL_VALUE.exec(entry);
    if (!match) {
      return [{ name: entry }];
    }
    return [{ name: match[1], attributeValue: match[2] }];
  }
}
