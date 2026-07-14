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
      '<div align="center" align="right"><b>' +
        '<a href="default.asp?p=ma&so=s&s=6">Season 4</a>, 11 - 12</b></div>' +
        TEAM_TABLE,
    );

    expect(parser.extractMatchTeams(page)).toEqual({
      bblId: '100',
      homeTeamId: 'vor',
      awayTeamId: 'sti',
      name: '11 - 12',
    });
  });

  it('preserves non-ASCII team ids', () => {
    const page = matchPage(
      '7',
      '<div align="center"><b>' +
        '<a href="default.asp?p=ma&so=s&s=6">Season 4</a>, Final</b></div>' +
        '<table class="tblist"><tr class="trborder">' +
        '<td width="180"><a href="default.asp?p=tm&t=äng"><b>A</b></a></td>' +
        '<td width="180"><a href="default.asp?p=tm&t=gås"><b>B</b></a></td>' +
        '</tr></table>',
    );

    expect(parser.extractMatchTeams(page)).toEqual({
      bblId: '7',
      homeTeamId: 'äng',
      awayTeamId: 'gås',
      name: 'Final',
    });
  });

  it('ignores p=tm links outside the team table', () => {
    const page = matchPage(
      '100',
      '<div align="center"><b>' +
        '<a href="default.asp?p=ma&so=s&s=6">Season 3</a>, Match 3</b></div>' +
        '<a href="default.asp?p=tm&t=sidebar">Major Season</a>' +
        TEAM_TABLE,
    );

    expect(parser.extractMatchTeams(page)?.homeTeamId).toBe('vor');
    expect(parser.extractMatchTeams(page)?.awayTeamId).toBe('sti');
  });

  it('returns null when params.m is missing', () => {
    const page: BblPage = {
      type: 'm',
      params: {},
      load: () => load(TEAM_TABLE),
    };
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

  it('extracts a special cup-final name after the comma', () => {
    const page = matchPage(
      '200',
      '<div align="center" align="right"><b>' +
        '<a href="default.asp?p=ma&so=s&s=32">Ogretoberfest 4</a>, ' +
        'Bierhallentodball</b></div>' +
        TEAM_TABLE,
    );

    expect(parser.extractMatchTeams(page)?.name).toBe('Bierhallentodball');
  });

  it('returns null when the bold header has no text after the comma', () => {
    const page = matchPage(
      '201',
      '<div align="center"><b>' +
        '<a href="default.asp?p=ma&so=s&s=6">Season 4</a></b></div>' +
        TEAM_TABLE,
    );

    expect(parser.extractMatchTeams(page)).toBeNull();
  });

  it('returns null when the competition-name header is absent', () => {
    const page = matchPage('202', TEAM_TABLE);

    expect(parser.extractMatchTeams(page)).toBeNull();
  });
});
