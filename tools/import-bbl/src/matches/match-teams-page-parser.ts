import { Injectable } from '@nestjs/common';

import type { BblPage } from '../source/bbl-page';

// e.g. `default.asp?p=tm&t=vor` off a match page's team link. Team codes can
// contain non-ASCII letters (e.g. "gås", "äng"), so match everything up to the
// next query param or fragment rather than an ASCII-only character class.
const TEAM_LINK = /[?&]p=tm&t=([^&#]+)/;

/** The two teams of a single match, read off its detail page (`p=m&m=<id>`). */
export interface BblMatchTeams {
  bblId: string;
  homeTeamId: string;
  awayTeamId: string;
}

@Injectable()
export class MatchTeamsPageParser {
  /**
   * Extract the home and away team ids from a match detail page
   * (`p=m&m=<id>`). `bblId` is the page's own `m` param. The two teams are the
   * `<a href="default.asp?p=tm&t=<id>">` links inside the first two
   * `<td width="180">` cells of `table.tblist`'s first `tr.trborder` row (home
   * first, away second); scoping to those cells ignores unrelated `p=tm` links
   * elsewhere on the page (e.g. a season sidebar). Returns null when the id is
   * missing, fewer than two such cells are present, or either team link's id
   * cannot be extracted — a defensive skip, not a thrown error.
   */
  extractMatchTeams(page: BblPage): BblMatchTeams | null {
    const bblId = page.params.m?.trim();
    if (!bblId) {
      return null;
    }
    const $ = page.load();
    const cells = $('table.tblist tr.trborder').first().find('td[width="180"]');
    if (cells.length < 2) {
      return null;
    }
    const home = TEAM_LINK.exec(
      $(cells[0]).find('a').first().attr('href') ?? '',
    );
    const away = TEAM_LINK.exec(
      $(cells[1]).find('a').first().attr('href') ?? '',
    );
    if (!home || !away) {
      return null;
    }
    return { bblId, homeTeamId: home[1], awayTeamId: away[1] };
  }
}
