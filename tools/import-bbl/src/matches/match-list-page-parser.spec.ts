import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';

import type { BblPage } from '../source/bbl-page';
import { MatchListPageParser } from './match-list-page-parser';

function matchListPage(html: string): BblPage {
  return { type: 'ma', params: { so: 's', s: '1' }, load: () => load(html) };
}

const parser = new MatchListPageParser();

describe('MatchListPageParser', () => {
  it('extracts a UTC date for each "result added" match row', () => {
    const page = matchListPage(
      '<table>' +
        '<tr title="result added December 18th, 2011"><td>a</td></tr>' +
        '<tr title="result added December 7th, 2011"><td>b</td></tr>' +
        '</table>',
    );

    const dates = parser.extractMatchDates(page);

    expect(dates).toEqual([
      new Date(Date.UTC(2011, 11, 18)),
      new Date(Date.UTC(2011, 11, 7)),
    ]);
  });

  it('handles every ordinal suffix (st/nd/rd/th)', () => {
    const page = matchListPage(
      '<table>' +
        '<tr title="result added September 1st, 2021"></tr>' +
        '<tr title="result added September 2nd, 2021"></tr>' +
        '<tr title="result added September 3rd, 2021"></tr>' +
        '<tr title="result added September 25th, 2021"></tr>' +
        '</table>',
    );

    expect(parser.extractMatchDates(page)).toEqual([
      new Date(Date.UTC(2021, 8, 1)),
      new Date(Date.UTC(2021, 8, 2)),
      new Date(Date.UTC(2021, 8, 3)),
      new Date(Date.UTC(2021, 8, 25)),
    ]);
  });

  it('ignores title attributes that are not a "result added" date', () => {
    const page = matchListPage(
      '<a title="show the season standings">x</a>' +
        '<table><tr title="result added March 4th, 2015"></tr></table>',
    );

    expect(parser.extractMatchDates(page)).toEqual([
      new Date(Date.UTC(2015, 2, 4)),
    ]);
  });

  it('returns an empty array when the page has no dated rows', () => {
    const page = matchListPage(
      '<table><tr><td>no matches yet</td></tr></table>',
    );
    expect(parser.extractMatchDates(page)).toEqual([]);
  });
});
