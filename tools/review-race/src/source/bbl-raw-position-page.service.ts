import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';

import { BblMirrorReaderService } from './bbl-mirror-reader.service';
import type { BblRawSkillRef } from './bbl-skill-entry.service';
import { BblSkillEntryService } from './bbl-skill-entry.service';

/** BBL's own position ids are always plain numbers (the `typID` param). */
const NUMERIC_TYP_ID = /^\d+$/;

/** The characteristics table's header cells, in column order. */
const CHARACTERISTIC_HEADERS = ['MA', 'ST', 'AG', 'PA', 'AV'] as const;

/** One position's raw characteristics line, exactly as the page shows it. */
export interface BblRawCharacteristics {
  move: string;
  strength: string;
  agility: string;
  /** null when the page shows a literal `-`. */
  passing: string | null;
  armour: string;
}

/** What BBL's own `p=pt` page says about one position. */
export interface BblRawPosition {
  typId: string;
  name: string;
  isStarPlayer: boolean;
  races: { bblId: string; name: string }[];
  characteristics: BblRawCharacteristics | null;
  /** The Skills cell of the characteristics row, one ref per entry. */
  skills: BblRawSkillRef[];
}

/**
 * Reads one BBL position page and extracts what the report compares against:
 * name, star-player flag, the races the page says the position can play for,
 * and its characteristics line. Parsed here with cheerio, never through
 * tools/import-bbl's PositionPageParser — the importer's reading of this page
 * is what the report exists to check.
 */
@Injectable()
export class BblRawPositionPageService {
  private readonly cache = new Map<string, BblRawPosition | null>();

  constructor(
    private readonly reader: BblMirrorReaderService,
    private readonly skillEntries: BblSkillEntryService,
  ) {}

  async positionFor(typId: string): Promise<BblRawPosition | null> {
    if (!NUMERIC_TYP_ID.test(typId)) {
      return null;
    }
    const cached = this.cache.get(typId);
    if (cached !== undefined) {
      return cached;
    }
    const parsed = await this.load(typId);
    this.cache.set(typId, parsed);
    return parsed;
  }

  private async load(typId: string): Promise<BblRawPosition | null> {
    const page = await this.reader.readPage(`default.asp?p=pt&typID=${typId}`);
    if (page === null) {
      return null;
    }
    const $ = cheerio.load(page);
    const name = this.text($('h1').first().text());
    if (name === '') {
      return null;
    }
    return {
      typId,
      name,
      isStarPlayer: this.isStarPlayer($),
      races: this.races($),
      characteristics: this.characteristics($),
      skills: this.skills($),
    };
  }

  private races($: cheerio.CheerioAPI): { bblId: string; name: string }[] {
    const races: { bblId: string; name: string }[] = [];
    const seen = new Set<string>();
    $('a').each((_index, element) => {
      const href = $(element).attr('href') ?? '';
      const bblId = /[?&]p=tl#(\d+)/.exec(href)?.[1];
      const name = this.text($(element).text());
      if (bblId === undefined || name === '' || seen.has(bblId)) {
        return;
      }
      seen.add(bblId);
      races.push({ bblId, name });
    });
    return races;
  }

  private isStarPlayer($: cheerio.CheerioAPI): boolean {
    let star = false;
    $('td').each((_index, element) => {
      if (this.text($(element).text()) === 'None (star player)') {
        star = true;
        return false;
      }
      return undefined;
    });
    return star;
  }

  private characteristics($: cheerio.CheerioAPI): BblRawCharacteristics | null {
    for (const row of $('tr').toArray()) {
      const headers = $(row)
        .children('th, td')
        .toArray()
        .map((cell) => this.text($(cell).text()));
      if (CHARACTERISTIC_HEADERS.some((header, i) => headers[i] !== header)) {
        continue;
      }
      const cells = $(row).next('tr').children('td').toArray();
      if (cells.length < CHARACTERISTIC_HEADERS.length) {
        return null;
      }
      return this.characteristicsFrom(
        cells
          .slice(0, CHARACTERISTIC_HEADERS.length)
          .map((cell) => this.text($(cell).text())),
      );
    }
    return null;
  }

  private characteristicsFrom(texts: string[]): BblRawCharacteristics | null {
    const [moveText, strengthText, agilityText, passingText, armourText] =
      texts;
    const move = this.value(moveText);
    const strength = this.value(strengthText);
    const agility = this.value(agilityText);
    const armour = this.value(armourText);
    const passing = passingText === '-' ? null : this.value(passingText);
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

  /**
   * The Skills cell of the characteristics table: the sixth cell of the row
   * after the MA/ST/AG/PA/AV header row. Empty when there is no such table,
   * no sixth cell, or the cell is blank — a position with no starting skills
   * is the common case, not an anomaly.
   */
  private skills($: cheerio.CheerioAPI): BblRawSkillRef[] {
    for (const row of $('tr').toArray()) {
      const headers = $(row)
        .children('th, td')
        .toArray()
        .map((cell) => this.text($(cell).text()));
      if (CHARACTERISTIC_HEADERS.some((header, i) => headers[i] !== header)) {
        continue;
      }
      const cells = $(row).next('tr').children('td').toArray();
      const skillsCell = cells[CHARACTERISTIC_HEADERS.length];
      return skillsCell === undefined
        ? []
        : this.skillEntries.parseCell($(skillsCell).text());
    }
    return [];
  }

  /** A plain or `+`-suffixed number as scraped; anything else is unreadable. */
  private value(text: string): string | null {
    return /^\d+\+?$/.test(text) ? text : null;
  }

  private text(raw: string): string {
    return raw.replace(/\xA0/g, ' ').trim().replace(/\s+/g, ' ');
  }
}
