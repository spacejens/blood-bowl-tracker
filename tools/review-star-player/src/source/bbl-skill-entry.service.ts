import { Injectable } from '@nestjs/common';

/** One skill as a BBL Skills cell writes it. */
export interface BblRawSkillRef {
  name: string;
  /** The trailing parenthetical's contents, or null when there was none. */
  attributeValue: string | null;
}

/** A trailing parenthetical value; the space before the paren is optional. */
const PARENTHETICAL_VALUE = /^(.+?) ?\(([^()]+)\)$/;

/**
 * Splits a BBL Skills cell into one ref per skill: comma-separated entries,
 * with a trailing parenthetical split off as the attribute value.
 *
 * Carries no repair table for BBL's known garbled entries — those repairs are
 * `tools/import-bbl`'s, and they are part of what this report exists to
 * check, so a garbled entry is shown verbatim.
 *
 * A deliberate copy of `tools/review-race`'s service of the same name: the
 * review tools never depend on each other.
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
