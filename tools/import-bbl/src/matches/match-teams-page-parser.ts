import { Injectable } from '@nestjs/common';

import type { BblPage } from '../source/bbl-page';
import { normalizeExtractedText } from '../source/normalize-extracted-text';

// e.g. `default.asp?p=tm&t=vor` off a match page's team link. Team codes can
// contain non-ASCII letters (e.g. "gås", "äng"), so match everything up to the
// next query param or fragment rather than an ASCII-only character class.
const TEAM_LINK = /[?&]p=tm&t=([^&#]+)/;

/** The teams and display name of a single match, read off its detail page. */
export interface BblMatchDetails {
  bblId: string;
  homeTeamId: string;
  awayTeamId: string;
  name: string;
}

@Injectable()
export class MatchTeamsPageParser {
  /**
   * Extract the home/away team ids and the display name from a match detail
   * page (`p=m&m=<id>`). `bblId` is the page's own `m` param. The two teams are
   * the `<a href="default.asp?p=tm&t=<id>">` links inside the first two
   * `<td width="180">` cells of `table.tblist`'s first `tr.trborder` row (home
   * first, away second). The name is the text after the comma inside the bold
   * header wrapping the competition link (`<b><a href="...p=ma...">Comp</a>,
   * <name></b>`). Returns null when the id is missing, fewer than two team
   * cells are present, either team link's id cannot be extracted, or the name
   * is missing — a defensive skip, not a thrown error.
   */
  extractMatchTeams(page: BblPage): BblMatchDetails | null {
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

    // The name lives in the bold header that wraps the competition link:
    // `<b><a href="...p=ma...">Season 4</a>, 11 - 12</b>`. Scope to that bold
    // element so unrelated `p=ma` links elsewhere on the page are ignored, then
    // take the text after the competition link's own text and strip the comma.
    const header = $('b')
      .filter((_, el) => $(el).find('a[href*="p=ma"]').length > 0)
      .first();
    if (header.length === 0) {
      return null;
    }
    const compText = header.find('a[href*="p=ma"]').first().text();
    const name = normalizeExtractedText(
      header
        .text()
        .slice(compText.length)
        .replace(/^\s*,\s*/, ''),
    );
    if (name.length === 0) {
      return null;
    }

    return { bblId, homeTeamId: home[1], awayTeamId: away[1], name };
  }
}
