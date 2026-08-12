import { Injectable } from '@nestjs/common';

import type { BblPage } from '../source/bbl-page.types';
import { NormalizeExtractedTextService } from '../source/normalize-extracted-text.service';

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
}

@Injectable()
export class PlayerPageParser {
  constructor(private readonly normalizeText: NormalizeExtractedTextService) {}

  /**
   * Extract player data from a player page. Reads `pid` from the page params,
   * `name` from the `<h1>` element, and `typId`/`teamCode` from position/team
   * links. A player page links its position (`default.asp?p=pt&typID=<digits>`)
   * and its team (`default.asp?p=tm&t=<code>`). The first of each is used.
   * Returns null when the pid, position link, or team link is absent, or when
   * the page has no `<h1>` element at all. An `<h1>` that is present but empty
   * is accepted as a valid, empty name (`''`) — some BBL players legitimately
   * have no name.
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

    if (!pid || $('h1').length === 0 || !typId || !teamCode) {
      return null;
    }
    return { pid, name, typId, teamCode, sppTotal: this.extractSppTotal($) };
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
}
