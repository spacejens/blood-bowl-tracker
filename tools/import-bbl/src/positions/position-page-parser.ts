import { Injectable } from '@nestjs/common';
import type { CheerioAPI } from 'cheerio';

import type { BblPage } from '../source/bbl-page.types';
import { NormalizeExtractedTextService } from '../source/normalize-extracted-text.service';

/** One race a position can play for: its numeric BBL id and display name. */
interface BblPositionRace {
  bblId: string;
  name: string;
}

/**
 * One position's raw characteristics line, exactly as the page shows it. This
 * is deliberately format-agnostic: a `-` in the Passing cell becomes `null`
 * here, and the decision between `null` and `0` is made later, per target
 * rules set, by BblPositionCharacteristicsImportService.
 */
export interface BblPositionCharacteristics {
  move: number;
  strength: number;
  agility: number;
  passing: number | null;
  armour: number;
}

/** The characteristics table's header cells, in column order. */
const CHARACTERISTIC_HEADERS = ['MA', 'ST', 'AG', 'PA', 'AV'];

/** One skill reference parsed out of the Skills cell: its bare name and, when
 * the entry carried a trailing parenthetical, the position-specific
 * attribute value that parenthetical held (e.g. "4+" for "Loner (4+)"). */
export interface BblPositionSkillRef {
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
const KNOWN_GARBLED_SKILL_ENTRIES: Record<
  string,
  BblPositionSkillRef[] | undefined
> = {
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
 * A position ("player type") extracted from a `p=pt` page. `typId` is the
 * position's own numeric BBL id (the page's `typID` param); `name` is the
 * `<h1>` display name; `races` are the races listed under "Can play for:";
 * `isStarPlayer` indicates whether the skill-improvement-categories cell
 * contains the literal text "None (star player)"; `characteristics` is the
 * MA/ST/AG/PA/AV line from the characteristics table, if present.
 */
export interface BblPosition {
  typId: string;
  name: string;
  races: BblPositionRace[];
  isStarPlayer: boolean;
  characteristics: BblPositionCharacteristics | null;
  /**
   * The Skills column's comma-separated list, one ref per skill. A trailing
   * parenthetical (`Loner (4+)`, `Mighty Blow (+1)`) is split out into
   * `attributeValue`, separate from the skill's own bare `name`. Empty when
   * the cell is blank or the characteristics table is missing.
   */
  skills: BblPositionSkillRef[];
}

@Injectable()
export class PositionPageParser {
  constructor(private readonly normalizeText: NormalizeExtractedTextService) {}

  /**
   * Extract the position from a `p=pt` page. The name is the `<h1>` text; the
   * races are the "Can play for:" links, each `default.asp?p=tl#<raceId>` with
   * the race display name as its text (the same `p=tl#<id>` convention team
   * pages use for races). On a `pt` page those are the only `p=tl#` links, so
   * every such anchor is a listed race. Returns null when the page has no
   * `<h1>` name or the `typID` param is absent; returns an empty `races` array
   * when the position lists no race.
   */
  extractPosition(page: BblPage): BblPosition | null {
    const typId = page.params.typID ?? '';
    const $ = page.load();
    const name = this.normalizeText.normalize($('h1').first().text());
    if (!name || !typId) {
      return null;
    }

    const races: BblPositionRace[] = [];
    const seen = new Set<string>();
    $('a').each((_index, element) => {
      const href = $(element).attr('href') ?? '';
      const idMatch = /[?&]p=tl#(\d+)/.exec(href);
      if (!idMatch) {
        return;
      }
      const bblId = idMatch[1];
      const raceName = this.normalizeText.normalize($(element).text());
      if (!raceName || seen.has(bblId)) {
        return;
      }
      seen.add(bblId);
      races.push({ bblId, name: raceName });
    });

    let isStarPlayer = false;
    $('td').each((_index, element) => {
      if (
        this.normalizeText.normalize($(element).text()) === 'None (star player)'
      ) {
        isStarPlayer = true;
        return false;
      }
      return undefined;
    });

    return {
      typId,
      name,
      races,
      isStarPlayer,
      characteristics: this.extractCharacteristics($),
      skills: this.extractSkills($),
    };
  }

  /**
   * The MA/ST/AG/PA/AV values from the characteristics table: the row whose
   * first five cells are exactly those headers, and the `td`s of the row
   * immediately after it. A `pt` page carries several `trlisthead` rows, so the
   * table is found by its header *text*, not by its class. Returns null when
   * no such table is found, a required (non-Passing) value is unreadable, or
   * the Passing cell holds something other than a genuine `-` or a readable
   * number — an anomaly on real BBL data, guarded defensively rather than
   * expected.
   */
  private extractCharacteristics(
    $: CheerioAPI,
  ): BblPositionCharacteristics | null {
    for (const row of $('tr').toArray()) {
      const headers = $(row)
        .children('th, td')
        .toArray()
        .map((cell) => this.normalizeText.normalize($(cell).text()));
      if (CHARACTERISTIC_HEADERS.some((header, i) => headers[i] !== header)) {
        continue;
      }
      const cells = $(row).next('tr').children('td').toArray();
      if (cells.length < CHARACTERISTIC_HEADERS.length) {
        return null;
      }
      const texts = cells
        .slice(0, CHARACTERISTIC_HEADERS.length)
        .map((cell) => this.normalizeText.normalize($(cell).text()));
      const [moveText, strengthText, agilityText, passingText, armourText] =
        texts;
      const move = this.parseCharacteristic(moveText);
      const strength = this.parseCharacteristic(strengthText);
      const agility = this.parseCharacteristic(agilityText);
      const armour = this.parseCharacteristic(armourText);
      // Passing is the only column where `-` is a legitimate value; anything
      // else that fails to parse (garbage text, an empty cell) rejects the
      // whole line, same as an unreadable Move/Strength/Agility/Armour cell,
      // rather than being silently accepted as if it were a genuine `-`.
      const passing =
        passingText === '-' ? null : this.parseCharacteristic(passingText);
      if (
        move === null ||
        strength === null ||
        agility === null ||
        armour === null ||
        (passingText !== '-' && passing === null)
      ) {
        return null;
      }
      return { move, strength, agility, passing, armour };
    }
    return null;
  }

  /**
   * The Skills cell of the characteristics table: the sixth cell of the row
   * after the MA/ST/AG/PA/AV header row, split on top-level commas only, then
   * each comma-split entry resolved into a skill ref (see `resolveSkillRefs`).
   * Returns an empty list when there is no such table, no sixth cell, or the
   * cell is blank — a position with no starting skills is the common case,
   * not an anomaly.
   */
  private extractSkills($: CheerioAPI): BblPositionSkillRef[] {
    for (const row of $('tr').toArray()) {
      const headers = $(row)
        .children('th, td')
        .toArray()
        .map((cell) => this.normalizeText.normalize($(cell).text()));
      if (CHARACTERISTIC_HEADERS.some((header, i) => headers[i] !== header)) {
        continue;
      }
      const cells = $(row).next('tr').children('td').toArray();
      const skillsCell = cells[CHARACTERISTIC_HEADERS.length];
      if (skillsCell === undefined) {
        return [];
      }
      const entries = this.normalizeText
        .normalize($(skillsCell).text())
        .split(',')
        .map((skill) => this.normalizeText.normalize(skill))
        .filter((skill) => skill.length > 0);
      return entries.flatMap((entry) => this.resolveSkillRefs(entry));
    }
    return [];
  }

  /**
   * One comma-split Skills-cell entry resolved into zero, one, or two skill
   * refs. A known garbled BBL entry (see `KNOWN_GARBLED_SKILL_ENTRIES`) is
   * matched first, verbatim; otherwise a trailing parenthetical splits into
   * `name`/`attributeValue`, and an entry with no parenthetical passes
   * through as a bare name.
   */
  private resolveSkillRefs(entry: string): BblPositionSkillRef[] {
    if (Object.hasOwn(KNOWN_GARBLED_SKILL_ENTRIES, entry)) {
      return KNOWN_GARBLED_SKILL_ENTRIES[entry] ?? [];
    }
    const match = PARENTHETICAL_VALUE.exec(entry);
    if (!match) {
      return [{ name: entry }];
    }
    return [{ name: match[1], attributeValue: match[2] }];
  }

  /**
   * One characteristics cell: parses a plain or `+`-suffixed number (the
   * trailing `+` is display formatting the database does not store),
   * returning null for anything unparseable. Matches the whole cell text
   * against the expected shape first — `Number.parseInt` alone would accept
   * a numeric prefix followed by garbage (e.g. `parseInt('6x', 10) === 6`).
   */
  private parseCharacteristic(text: string): number | null {
    if (!/^\d+\+?$/.test(text)) {
      return null;
    }
    return Number.parseInt(text, 10);
  }
}
