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
        '<tr title="result added December 18th, 2011" onclick="self.location.href=\'default.asp?p=m&m=18\';"><td>a</td></tr>' +
        '<tr title="result added December 7th, 2011" onclick="self.location.href=\'default.asp?p=m&m=7\';"><td>b</td></tr>' +
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
        '<tr title="result added September 1st, 2021" onclick="self.location.href=\'default.asp?p=m&m=1\';"></tr>' +
        '<tr title="result added September 2nd, 2021" onclick="self.location.href=\'default.asp?p=m&m=2\';"></tr>' +
        '<tr title="result added September 3rd, 2021" onclick="self.location.href=\'default.asp?p=m&m=3\';"></tr>' +
        '<tr title="result added September 25th, 2021" onclick="self.location.href=\'default.asp?p=m&m=25\';"></tr>' +
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
        '<table><tr title="result added March 4th, 2015" ' +
        'onclick="self.location.href=\'default.asp?p=m&m=4\';"></tr></table>',
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

  it('skips "result added" rows with unknown month names', () => {
    const page = matchListPage(
      '<table>' +
        '<tr title="result added Foo 1st, 2021"></tr>' +
        '<tr title="result added March 4th, 2015" ' +
        'onclick="self.location.href=\'default.asp?p=m&m=4\';"></tr>' +
        '</table>',
    );

    expect(parser.extractMatchDates(page)).toEqual([
      new Date(Date.UTC(2015, 2, 4)),
    ]);
  });

  it('extracts date, home and away team names and bblId from a real-shaped match row', () => {
    const page = matchListPage(
      '<table>' +
        '<tr title="result added December 18th, 2011" class="trlist" ' +
        'onclick="self.location.href=\'default.asp?p=m&m=18\';">' +
        '<td class="td10">&nbsp;</td>' +
        '<td class="td10" align="center">Final</td>' +
        '<td class="td10" width="120" align="right">Sewerton Scavengers</td>' +
        '<td class="td10" width="10" align="center">-</td>' +
        '<td class="td10" width="120" align="left">Vorgash New Order</td>' +
        '<td class="td10" align="center">3 - 1</td>' +
        '</tr>' +
        '</table>',
    );

    expect(parser.extractMatches(page)).toEqual([
      {
        bblId: '18',
        date: new Date(Date.UTC(2011, 11, 18)),
        homeTeam: 'Sewerton Scavengers',
        awayTeam: 'Vorgash New Order',
      },
    ]);
  });

  it('yields empty team names when the team cells are missing', () => {
    const page = matchListPage(
      '<table><tr title="result added March 4th, 2015" ' +
        'onclick="self.location.href=\'default.asp?p=m&m=42\';"></tr></table>',
    );

    expect(parser.extractMatches(page)).toEqual([
      {
        bblId: '42',
        date: new Date(Date.UTC(2015, 2, 4)),
        homeTeam: '',
        awayTeam: '',
      },
    ]);
  });

  it('skips a dated row whose onclick has no match link', () => {
    const page = matchListPage(
      '<table>' +
        '<tr title="result added March 4th, 2015"></tr>' +
        '<tr title="result added March 5th, 2015" ' +
        'onclick="self.location.href=\'default.asp?p=m&m=99\';"></tr>' +
        '</table>',
    );

    expect(parser.extractMatches(page)).toEqual([
      {
        bblId: '99',
        date: new Date(Date.UTC(2015, 2, 5)),
        homeTeam: '',
        awayTeam: '',
      },
    ]);
  });

  it('extractMatchDates returns just the dates from extractMatches', () => {
    const page = matchListPage(
      '<table>' +
        '<tr title="result added December 18th, 2011" ' +
        'onclick="self.location.href=\'default.asp?p=m&m=18\';">' +
        '<td width="120" align="right">A</td>' +
        '<td width="10">-</td>' +
        '<td width="120" align="left">B</td>' +
        '</tr>' +
        '<tr title="result added December 7th, 2011" ' +
        'onclick="self.location.href=\'default.asp?p=m&m=7\';">' +
        '<td width="120" align="right">C</td>' +
        '<td width="10">-</td>' +
        '<td width="120" align="left">D</td>' +
        '</tr>' +
        '</table>',
    );

    expect(parser.extractMatchDates(page)).toEqual([
      new Date(Date.UTC(2011, 11, 18)),
      new Date(Date.UTC(2011, 11, 7)),
    ]);
  });
});
