import { Injectable } from '@nestjs/common';
import type { CheerioAPI } from 'cheerio';

import type { BblPage } from '../source/bbl-page.types';
import { NormalizeExtractedTextService } from '../source/normalize-extracted-text.service';

/**
 * One player's raw characteristics line, exactly as their page shows it. This
 * is deliberately format-agnostic: a `-` in the Passing cell becomes `null`
 * here, and the decision between `null` and `0` is made later, against the
 * rules set of the player's era, by BblPlayersImportService.
 *
 * Parsed independently of BblPositionCharacteristics rather than sharing a
 * helper, matching this package's existing per-entity parser boundaries.
 */
export interface BblPlayerCharacteristics {
  move: number;
  strength: number;
  agility: number;
  passing: number | null;
  armour: number;
}

/** The characteristics table's header cells, in column order. */
const CHARACTERISTIC_HEADERS = ['MA', 'ST', 'AG', 'PA', 'AV'];

/**
 * A player read off a `p=pl` page. `pid` is the player's page id (from
 * `page.params.pid`); `name` is the `<h1>` text. `typId` is the player's
 * position id (the `p=pt&typID=<N>` link); `teamCode` is the player's team
 * page id (the `p=tm&t=<code>` link).
 */
export interface BblPlayer {
  pid: string;
  name: string;
  typId: string;
  teamCode: string;
  /**
   * BBL's own displayed career SPP total — the parenthesized figure on the
   * "Unspent SPP" row (the middle cell is unspent SPP, which can be
   * negative, and is not this). `null` when the row is absent or carries no
   * parenthesized figure. Used only as an input to computing
   * `players.spp_adjustment`; it is never stored as `players.spp_total`,
   * because BBL's figure mixes award rates across eras — its site
   * recalculated pre-BB2020 totals at BB2020 rates, so the raw scraped
   * number isn't the era-correct total this repo wants `spp_total` to mean.
   */
  sppTotal: number | null;
  /**
   * The MA/ST/AG/PA/AV line from the player's own characteristics table.
   * Non-nullable: a page whose line cannot be read fails player extraction
   * entirely, the same way a missing name/position/team link does.
   */
  characteristics: BblPlayerCharacteristics;
}

@Injectable()
export class PlayerPageParser {
  constructor(private readonly normalizeText: NormalizeExtractedTextService) {}

  /**
   * Extract player data from a player page. Reads `pid` from the page params,
   * `name` from the `<h1>` element, and `typId`/`teamCode` from position/team
   * links. A player page links its position (`default.asp?p=pt&typID=<digits>`)
   * and its team (`default.asp?p=tm&t=<code>`). The first of each is used.
   * Returns null when the pid, position link, team link, or readable
   * characteristics line is absent, or when the page has no `<h1>` element at
   * all. An `<h1>` that is present but empty is accepted as a valid, empty
   * name (`''`) — some BBL players legitimately have no name.
   */
  extractPlayer(page: BblPage): BblPlayer | null {
    const $ = page.load();
    const pid = page.params.pid;
    const name = this.normalizeText.normalize($('h1').first().text());
    let typId: string | undefined;
    let teamCode: string | undefined;

    $('a').each((_index, element) => {
      const href = $(element).attr('href') ?? '';
      if (!typId) {
        const typMatch = /[?&]p=pt&typID=(\d+)/.exec(href);
        if (typMatch) {
          typId = typMatch[1];
        }
      }
      if (!teamCode) {
        // Team codes can contain non-ASCII letters (e.g. "gås", "häl"), so
        // match everything up to the next query param or fragment rather than
        // an ASCII-only character class.
        const teamMatch = /[?&]p=tm&t=([^&#]+)/.exec(href);
        if (teamMatch) {
          teamCode = teamMatch[1];
        }
      }
    });

    const characteristics = this.extractCharacteristics($);
    if (
      !pid ||
      $('h1').length === 0 ||
      !typId ||
      !teamCode ||
      !characteristics
    ) {
      return null;
    }
    return {
      pid,
      name,
      typId,
      teamCode,
      sppTotal: this.extractSppTotal($),
      characteristics,
    };
  }

  /**
   * The career SPP total from the "Unspent SPP" row: find the label cell,
   * then read the first parenthesized integer in that row. A missing row (or
   * a row with no parenthesized figure) is not an error — the caller treats
   * it as "no total scraped".
   */
  private extractSppTotal($: ReturnType<BblPage['load']>): number | null {
    for (const element of $('td').toArray()) {
      if (this.normalizeText.normalize($(element).text()) !== 'Unspent SPP:') {
        continue;
      }
      const rowText = this.normalizeText.normalize($(element).parent().text());
      const match = /\((\d+)\)/.exec(rowText);
      return match ? Number(match[1]) : null;
    }
    return null;
  }

  /**
   * The MA/ST/AG/PA/AV values from the player's characteristics table: the row
   * whose first five cells are exactly those headers, and the `td`s of the row
   * immediately after it. A `pl` page carries several `trlisthead` rows, so the
   * table is found by its header *text*, not by its class. Returns null when no
   * such table is found, a required (non-Passing) value is unreadable, or the
   * Passing cell holds something other than a genuine `-` or a readable number.
   */
  private extractCharacteristics(
    $: CheerioAPI,
  ): BblPlayerCharacteristics | null {
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
      // whole line, rather than being silently accepted as if it were a `-`.
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
