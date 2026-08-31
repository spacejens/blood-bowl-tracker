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
   * One characteristics cell: parses a plain or `+`-suffixed number (the
   * trailing `+` is display formatting the database does not store),
   * returning null for anything unparseable.
   */
  private parseCharacteristic(text: string): number | null {
    const parsed = Number.parseInt(text.replace(/\+$/, ''), 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
}
