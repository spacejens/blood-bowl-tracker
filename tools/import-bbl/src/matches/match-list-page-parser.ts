import { Injectable } from '@nestjs/common';

import type { BblPage } from '../source/bbl-page.types';

const MONTHS: Record<string, number> = {
  January: 0,
  February: 1,
  March: 2,
  April: 3,
  May: 4,
  June: 5,
  July: 6,
  August: 7,
  September: 8,
  October: 9,
  November: 10,
  December: 11,
};

// e.g. `result added September 25th, 2021` off a match row's title attribute.
const RESULT_ADDED = /result added (\w+) (\d{1,2})(?:st|nd|rd|th), (\d{4})/;

// e.g. `self.location.href='default.asp?p=m&m=18';` off a match row's onclick.
const MATCH_LINK = /p=m&m=(\d+)/;

/** A single completed match read off a match-list row. */
export interface BblMatch {
  bblId: string;
  date: Date;
}

@Injectable()
export class MatchListPageParser {
  /**
   * Extract every completed match from a match-list page (`p=ma&so=s&s=<id>`).
   * A completed match is a row carrying a `title="result added <Month>
   * <Day><suffix>, <Year>"` attribute (its ordinal date is the only date data
   * available without a full match import). The match id is read from the row's
   * `onclick` link (`p=m&m=<id>`); rows without a parseable match link are
   * skipped defensively. Rows are returned in document order; a page with no
   * completed matches yields an empty array. This reads only dates and the
   * match id — no scores/casualties/gate.
   */
  extractMatches(page: BblPage): BblMatch[] {
    const $ = page.load();
    const matches: BblMatch[] = [];

    $('[title]').each((_index, element) => {
      const title = $(element).attr('title') ?? '';
      const match = RESULT_ADDED.exec(title);
      if (!match) {
        return;
      }
      const month = MONTHS[match[1]];
      if (month === undefined) {
        return;
      }
      const link = MATCH_LINK.exec($(element).attr('onclick') ?? '');
      if (!link) {
        return;
      }
      const bblId = link[1];
      const date = new Date(
        Date.UTC(Number(match[3]), month, Number(match[2])),
      );
      matches.push({ bblId, date });
    });

    return matches;
  }

  /**
   * Extract just the dates of every completed match (see {@link extractMatches}).
   */
  extractMatchDates(page: BblPage): Date[] {
    return this.extractMatches(page).map((m) => m.date);
  }
}
