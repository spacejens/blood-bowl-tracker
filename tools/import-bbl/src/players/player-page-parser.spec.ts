import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';

import type { BblPage } from '../source/bbl-page';
import { PlayerPageParser } from './player-page-parser';

function playerPage(html: string, pid = '5'): BblPage {
  return { type: 'pl', params: { pid }, load: () => load(html) };
}

const parser = new PlayerPageParser();

describe('PlayerPageParser', () => {
  it('extracts the pid, name, position typId and team code', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        '<a href="default.asp?p=pt&typID=33">Goblin Linemen</a>' +
        '<a href="default.asp?p=tm&t=knu">Knights</a>',
      '5',
    );
    expect(parser.extractPlayer(page)).toEqual({
      pid: '5',
      name: 'Griff Oberwald',
      typId: '33',
      teamCode: 'knu',
    });
  });

  it('extracts a team code containing non-ASCII characters', () => {
    const page = playerPage(
      '<h1>Aspgren</h1>' +
        '<a href="default.asp?p=pt&typID=169">Hafling Treeman</a>' +
        "<a href='default.asp?p=tm&t=gås' style='font-size:11px'>Gåshöjdens BK</a>",
    );
    expect(parser.extractPlayer(page)).toEqual({
      pid: '5',
      name: 'Aspgren',
      typId: '169',
      teamCode: 'gås',
    });
  });

  it('uses the first position and team links when several are present', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        '<a href="default.asp?p=pt&typID=33">Goblin Linemen</a>' +
        '<a href="default.asp?p=tm&t=knu">Knights</a>' +
        '<a href="default.asp?p=pt&typID=99">Other</a>' +
        '<a href="default.asp?p=tm&t=abc">Other Team</a>',
    );
    expect(parser.extractPlayer(page)).toEqual({
      pid: '5',
      name: 'Griff Oberwald',
      typId: '33',
      teamCode: 'knu',
    });
  });

  it('returns null when the position link is missing', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        '<a href="default.asp?p=tm&t=knu">Knights</a>',
    );
    expect(parser.extractPlayer(page)).toBeNull();
  });

  it('returns null when the team link is missing', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        '<a href="default.asp?p=pt&typID=33">Goblin Linemen</a>',
    );
    expect(parser.extractPlayer(page)).toBeNull();
  });

  it('returns null for a page with no relevant links', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' + '<a href="default.asp?p=tl#16">Orc Team</a>',
    );
    expect(parser.extractPlayer(page)).toBeNull();
  });

  it('returns a player with an empty name when the h1 is present but empty', () => {
    const page = playerPage(
      '<h1></h1>' +
        '<a href="default.asp?p=pt&typID=53">Skeleton Linemen</a>' +
        '<a href="default.asp?p=tm&t=nyt3">No name no pain!</a>',
      '388',
    );
    expect(parser.extractPlayer(page)).toEqual({
      pid: '388',
      name: '',
      typId: '53',
      teamCode: 'nyt3',
    });
  });

  it('returns null when there is no h1 element at all', () => {
    const page = playerPage(
      '<a href="default.asp?p=pt&typID=33">Goblin Linemen</a>' +
        '<a href="default.asp?p=tm&t=knu">Knights</a>',
    );
    expect(parser.extractPlayer(page)).toBeNull();
  });

  it('returns null when the pid param is missing', () => {
    const page: BblPage = {
      type: 'pl',
      params: {},
      load: () =>
        load(
          '<h1>Griff Oberwald</h1>' +
            '<a href="default.asp?p=pt&typID=33">x</a>' +
            '<a href="default.asp?p=tm&t=knu">y</a>',
        ),
    };
    expect(parser.extractPlayer(page)).toBeNull();
  });
});
