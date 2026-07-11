import { Injectable } from '@nestjs/common';

import type { BblPage } from '../source/bbl-page';

/**
 * A player's position/team linkage read off a `p=pl` page. `typId` is the
 * player's position id (the `p=pt&typID=<N>` link); `teamCode` is the player's
 * team page id (the `p=tm&t=<code>` link). This is the only data this feature
 * needs from player pages — no `players` rows are written.
 */
export interface BblPlayer {
  typId: string;
  teamCode: string;
}

@Injectable()
export class PlayerPageParser {
  /**
   * Extract `{ typId, teamCode }` from a player page. A player page links its
   * position (`default.asp?p=pt&typID=<digits>`) and its team
   * (`default.asp?p=tm&t=<code>`). The first of each is used. Returns null when
   * either link is absent.
   */
  extractPlayer(page: BblPage): BblPlayer | null {
    const $ = page.load();
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

    if (!typId || !teamCode) {
      return null;
    }
    return { typId, teamCode };
  }
}
