import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';

import { StarPlayerNameMatcherService } from '../shared/star-player-name-matcher.service';
import { BblMirrorReaderService } from './bbl-mirror-reader.service';
import type { BblRawSkillRef } from './bbl-skill-entry.service';
import { BblSkillEntryService } from './bbl-skill-entry.service';

/** BBL's own position ids are always plain numbers (the `typID` param). */
const NUMERIC_TYP_ID = /^\d+$/;

/** The marker cell every star player's page carries. */
const STAR_MARKER = 'None (star player)';

/** The characteristics table's header cells, in column order. */
const CHARACTERISTIC_HEADERS = ['MA', 'ST', 'AG', 'PA', 'AV'] as const;

/** `inducement price: 230 000 gp`, as the page writes a star's cost. */
const INDUCEMENT_PRICE = /inducement price:\s*([\d\s.,]+gp)/i;

/** One star's raw characteristics line, exactly as the page shows it. */
export interface BblRawCharacteristics {
  move: string;
  strength: string;
  agility: string;
  /** null when the page shows a literal `-`. */
  passing: string | null;
  armour: string;
}

/** What BBL's own `p=pt` page says about one star player. */
export interface BblRawStarPlayer {
  typId: string;
  name: string;
  /** The inducement price line verbatim, e.g. `230 000 gp`. */
  cost: string | null;
  /** The "Can play for:" cell's text, e.g. `Any team with Elven Kingdoms League`. */
  canPlayFor: string | null;
  /** The skills cell verbatim; shown but never compared. */
  skills: string | null;
  /**
   * The same skills cell, split into refs. The verbatim `skills` string above
   * stays as-is for display; these refs are what the starting-skills panel
   * formats and compares.
   */
  skillRefs: BblRawSkillRef[];
  characteristics: BblRawCharacteristics | null;
}

/**
 * Reads BBL's own position pages and keeps the star-player ones. Parsed here
 * with cheerio, never through tools/import-bbl's PositionPageParser — the
 * importer's reading of these pages is what the report exists to check.
 *
 * Two lookups, because a star's DB row does not always carry a BBL typID: the
 * importer registers `"<typId>-<raceBblId>"` ids only for the races the page
 * listed, so a star whose page lists none has a `Name` id and nothing else.
 * `starFor` addresses a page directly; `starForName` falls back to a one-time
 * sweep of every `default.asp?p=pt&typID=<n>` file (about 216 of them in this
 * repo's mirror, so the sweep is cheap), indexed by typID and by name.
 *
 * The name index is keyed both by an exact fold and by
 * `StarPlayerNameMatcherService.normalize()`, so a lookup tries an exact
 * match first and falls back to the normalized form — BBL and TP disagree
 * routinely on apostrophes, quote style and a duo star's parenthesised
 * partner, and a raw source lookup keyed on exact text alone would report
 * "no data" for a star that really is there under a different spelling.
 */
@Injectable()
export class BblRawStarPlayerPageService {
  private readonly byTypId = new Map<string, BblRawStarPlayer | null>();
  private sweep: Promise<Map<string, BblRawStarPlayer>> | undefined;

  constructor(
    private readonly reader: BblMirrorReaderService,
    private readonly names: StarPlayerNameMatcherService,
    private readonly skillEntries: BblSkillEntryService,
  ) {}

  async starFor(typId: string): Promise<BblRawStarPlayer | null> {
    if (!NUMERIC_TYP_ID.test(typId)) {
      return null;
    }
    const cached = this.byTypId.get(typId);
    if (cached !== undefined) {
      return cached;
    }
    const page = await this.reader.readPage(`default.asp?p=pt&typID=${typId}`);
    const parsed = page === null ? null : this.parse(typId, page);
    this.byTypId.set(typId, parsed);
    return parsed;
  }

  /**
   * The star page whose `<h1>` names this star: an exact fold match first,
   * then a fall back to `StarPlayerNameMatcherService.normalize()`.
   */
  async starForName(name: string): Promise<BblRawStarPlayer | null> {
    this.sweep ??= this.buildNameIndex();
    const index = await this.sweep;
    return (
      index.get(this.key(name)) ?? index.get(this.names.normalize(name)) ?? null
    );
  }

  private async buildNameIndex(): Promise<Map<string, BblRawStarPlayer>> {
    const index = new Map<string, BblRawStarPlayer>();
    for (const filename of await this.reader.listPositionPageFilenames()) {
      const typId = filename.slice(filename.lastIndexOf('=') + 1);
      const star = await this.starFor(typId);
      if (star === null) {
        continue;
      }
      for (const key of [
        this.key(star.name),
        this.names.normalize(star.name),
      ]) {
        if (!index.has(key)) {
          index.set(key, star);
        }
      }
    }
    return index;
  }

  private key(name: string): string {
    return name.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  /** A page is a star player's exactly when it carries the marker cell. */
  private parse(typId: string, page: string): BblRawStarPlayer | null {
    const $ = cheerio.load(page);
    const name = this.text($('h1').first().text());
    if (name === '' || !this.isStarPlayer($)) {
      return null;
    }
    const row = this.characteristicsRow($);
    const characteristics = row === null ? null : this.characteristics($, row);
    const skills =
      row === null || characteristics === null ? null : this.skills($, row);
    return {
      typId,
      name,
      cost: this.cost($),
      canPlayFor: this.canPlayFor($),
      skills,
      skillRefs: this.skillEntries.parseCell(skills ?? ''),
      characteristics,
    };
  }

  private isStarPlayer($: cheerio.CheerioAPI): boolean {
    return $('td')
      .toArray()
      .some((cell) => this.text($(cell).text()) === STAR_MARKER);
  }

  private cost($: cheerio.CheerioAPI): string | null {
    const match = INDUCEMENT_PRICE.exec(this.text($('body').text()));
    return match === null ? null : this.text(match[1] ?? '');
  }

  /**
   * The "Can play for:" table's single data cell. BBL writes either nothing
   * (a star with no recorded eligibility line) or
   * `Any team with <special rule>`; both are shown verbatim, because deciding
   * what that phrase implies is exactly the reviewer's job.
   */
  private canPlayFor($: cheerio.CheerioAPI): string | null {
    for (const row of $('tr').toArray()) {
      const header = this.text($(row).children('th').first().text());
      if (header !== 'Can play for:') {
        continue;
      }
      const cell = this.text($(row).next('tr').children('td').first().text());
      return cell === '' ? null : cell;
    }
    return null;
  }

  private skills(
    $: cheerio.CheerioAPI,
    row: NonNullable<ReturnType<typeof this.characteristicsRow>>,
  ): string | null {
    const cells = row.children('td').toArray();
    const skills = cells[CHARACTERISTIC_HEADERS.length];
    const text = skills === undefined ? '' : this.text($(skills).text());
    return text === '' ? null : text;
  }

  private characteristics(
    $: cheerio.CheerioAPI,
    row: NonNullable<ReturnType<typeof this.characteristicsRow>>,
  ): BblRawCharacteristics | null {
    const cells = row.children('td').toArray();
    if (cells.length < CHARACTERISTIC_HEADERS.length) {
      return null;
    }
    const texts = cells
      .slice(0, CHARACTERISTIC_HEADERS.length)
      .map((cell) => this.text($(cell).text()));
    return this.characteristicsFrom(texts);
  }

  /** The `<tr>` directly under the `MA ST AG PA AV` header row. */
  private characteristicsRow($: cheerio.CheerioAPI) {
    for (const row of $('tr').toArray()) {
      const headers = $(row)
        .children('th, td')
        .toArray()
        .map((cell) => this.text($(cell).text()));
      if (CHARACTERISTIC_HEADERS.every((header, i) => headers[i] === header)) {
        const next = $(row).next('tr');
        return next.length > 0 ? next : null;
      }
    }
    return null;
  }

  private characteristicsFrom(texts: string[]): BblRawCharacteristics | null {
    const [move, strength, agility, passingText, armour] = texts;
    const passing = passingText === '-' ? null : this.value(passingText);
    if (
      this.value(move) === null ||
      this.value(strength) === null ||
      this.value(agility) === null ||
      this.value(armour) === null ||
      (passingText !== '-' && passing === null)
    ) {
      return null;
    }
    return {
      move: move,
      strength: strength,
      agility: agility,
      passing,
      armour: armour,
    };
  }

  /** A plain or `+`-suffixed number as scraped; anything else is unreadable. */
  private value(text: string | undefined): string | null {
    return text !== undefined && /^\d+\+?$/.test(text) ? text : null;
  }

  private text(raw: string): string {
    return raw.replace(/\xA0/g, ' ').trim().replace(/\s+/g, ' ');
  }
}
