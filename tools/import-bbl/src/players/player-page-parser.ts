import { Injectable } from '@nestjs/common';

import type { BblPage } from '../source/bbl-page';

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
}

@Injectable()
export class PlayerPageParser {
  /**
   * Extract player data from a player page. Reads `pid` from the page params,
   * `name` from the `<h1>` element, and `typId`/`teamCode` from position/team
   * links. A player page links its position (`default.asp?p=pt&typID=<digits>`)
   * and its team (`default.asp?p=tm&t=<code>`). The first of each is used.
   * Returns null when any of the four fields is absent.
   */
  extractPlayer(page: BblPage): BblPlayer | null {
    const $ = page.load();
    const pid = page.params.pid;
    const name = $('h1').first().text().trim();
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
        const teamMatch = /[?&]p=tm&t=([a-zA-Z0-9]+)/.exec(href);
        if (teamMatch) {
          teamCode = teamMatch[1];
        }
      }
    });

    if (!pid || !name || !typId || !teamCode) {
      return null;
    }
    return { pid, name, typId, teamCode };
  }
}
