import { Injectable } from '@nestjs/common';

/** One skill as a BBL Skills cell writes it. */
export interface BblRawSkillRef {
  name: string;
  /** The trailing parenthetical's contents, or null when there was none. */
  attributeValue: string | null;
}

/**
 * A trailing parenthetical value, e.g. `"Loner (4+)"` -> `"4+"`. The space
 * before the paren is optional: real BBL data drops it too.
 */
const PARENTHETICAL_VALUE = /^(.+?) ?\(([^()]+)\)$/;

/**
 * Splits a BBL Skills cell into one ref per skill, on this tool's own terms:
 * comma-separated entries, with a trailing parenthetical split off as the
 * attribute value.
 *
 * Deliberately carries NO repair table for the known garbled BBL entries
 * `tools/import-bbl`'s `SkillEntryService` fixes up. Those repairs are
 * exactly what a reviewer needs to see the raw side of, so a garbled entry is
 * shown verbatim here and shows up as a difference against the stored data.
 */
@Injectable()
export class BblSkillEntryService {
  parseCell(text: string): BblRawSkillRef[] {
    return this.normalize(text)
      .split(',')
      .map((entry) => this.normalize(entry))
      .filter((entry) => entry.length > 0)
      .map((entry) => this.ref(entry));
  }

  private ref(entry: string): BblRawSkillRef {
    const match = PARENTHETICAL_VALUE.exec(entry);
    return match === null
      ? { name: entry, attributeValue: null }
      : { name: match[1], attributeValue: match[2] };
  }

  private normalize(raw: string): string {
    return raw.replace(/\xA0/g, ' ').trim().replace(/\s+/g, ' ');
  }
}
