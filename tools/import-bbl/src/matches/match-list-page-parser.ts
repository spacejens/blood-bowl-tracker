import { Injectable } from '@nestjs/common';

import type { BblPage } from '../source/bbl-page';

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

@Injectable()
export class MatchListPageParser {
  /**
   * Extract every match's date from a match-list page (`p=ma&so=s&s=<id>`).
   * Match rows carry a `title="result added <Month> <Day><suffix>, <Year>"`
   * attribute; that ordinal date is the only date data available without a full
   * match import. Dates are returned as UTC midnight, in document order. This is
   * a minimal seed for future match-data import — no results/teams/scores are
   * read. Returns an empty array when no dated rows are present (e.g. an
   * in-progress competition with no results yet).
   */
  extractMatchDates(page: BblPage): Date[] {
    const $ = page.load();
    const dates: Date[] = [];

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
      dates.push(new Date(Date.UTC(Number(match[3]), month, Number(match[2]))));
    });

    return dates;
  }
}
