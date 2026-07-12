import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';

import type { BblPage } from '../source/bbl-page';
import { MatchTeamsPageParser } from './match-teams-page-parser';

function matchPage(id: string, html: string): BblPage {
  return { type: 'm', params: { m: id }, load: () => load(html) };
}

const parser = new MatchTeamsPageParser();

const TEAM_TABLE =
  '<table class="tblist"><tr class="trborder">' +
  '<td width="180"><a href="default.asp?p=tm&t=vor"><b>Vorgash New Order</b></a></td>' +
  '<td width="100">gate</td>' +
  '<td width="180"><a href="default.asp?p=tm&t=sti"><b>Silly Titans</b></a></td>' +
  '</tr></table>';

describe('MatchTeamsPageParser', () => {
  it('extracts home and away team ids from the first tblist trborder row', () => {
    const page = matchPage(
      '100',
      '<div><a href="default.asp?p=ma&so=s&s=4">Season 3</a></div>' + TEAM_TABLE,
    );

    expect(parser.extractMatchTeams(page)).toEqual({
      bblId: '100',
      homeTeamId: 'vor',
      awayTeamId: 'sti',
    });
  });

  it('preserves non-ASCII team ids', () => {
    const page = matchPage(
      '7',
      '<table class="tblist"><tr class="trborder">' +
        '<td width="180"><a href="default.asp?p=tm&t=äng"><b>A</b></a></td>' +
        '<td width="180"><a href="default.asp?p=tm&t=gås"><b>B</b></a></td>' +
        '</tr></table>',
    );

    expect(parser.extractMatchTeams(page)).toEqual({
      bblId: '7',
      homeTeamId: 'äng',
      awayTeamId: 'gås',
    });
  });

  it('ignores p=tm links outside the team table', () => {
    const page = matchPage(
      '100',
      '<a href="default.asp?p=tm&t=sidebar">Major Season</a>' + TEAM_TABLE,
    );

    expect(parser.extractMatchTeams(page)?.homeTeamId).toBe('vor');
    expect(parser.extractMatchTeams(page)?.awayTeamId).toBe('sti');
  });

  it('returns null when params.m is missing', () => {
    const page: BblPage = { type: 'm', params: {}, load: () => load(TEAM_TABLE) };
    expect(parser.extractMatchTeams(page)).toBeNull();
  });

  it('returns null when the team table is missing', () => {
    const page = matchPage('100', '<div>no team table</div>');
    expect(parser.extractMatchTeams(page)).toBeNull();
  });

  it('returns null when there is only one team cell', () => {
    const page = matchPage(
      '100',
      '<table class="tblist"><tr class="trborder">' +
        '<td width="180"><a href="default.asp?p=tm&t=vor"><b>A</b></a></td>' +
        '</tr></table>',
    );
    expect(parser.extractMatchTeams(page)).toBeNull();
  });

  it('returns null when a team cell has no p=tm link', () => {
    const page = matchPage(
      '100',
      '<table class="tblist"><tr class="trborder">' +
        '<td width="180"><a href="default.asp?p=tm&t=vor"><b>A</b></a></td>' +
        '<td width="180"><b>no link</b></td>' +
        '</tr></table>',
    );
    expect(parser.extractMatchTeams(page)).toBeNull();
  });
});
