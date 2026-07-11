import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';

import type { BblPage } from '../source/bbl-page';
import { PlayerPageParser } from './player-page-parser';

function playerPage(html: string): BblPage {
  return { type: 'pl', params: { pid: '5' }, load: () => load(html) };
}

const parser = new PlayerPageParser();

describe('PlayerPageParser', () => {
  it('extracts the position typId and the team code', () => {
    const page = playerPage(
      '<a href="default.asp?p=pt&typID=33">Goblin Linemen</a>' +
        '<a href="default.asp?p=tm&t=knu">Knights</a>',
    );
    expect(parser.extractPlayer(page)).toEqual({
      typId: '33',
      teamCode: 'knu',
    });
  });

  it('uses the first position and team links when several are present', () => {
    const page = playerPage(
      '<a href="default.asp?p=pt&typID=33">Goblin Linemen</a>' +
        '<a href="default.asp?p=tm&t=knu">Knights</a>' +
        '<a href="default.asp?p=pt&typID=99">Other</a>' +
        '<a href="default.asp?p=tm&t=abc">Other Team</a>',
    );
    expect(parser.extractPlayer(page)).toEqual({
      typId: '33',
      teamCode: 'knu',
    });
  });

  it('returns null when the position link is missing', () => {
    const page = playerPage('<a href="default.asp?p=tm&t=knu">Knights</a>');
    expect(parser.extractPlayer(page)).toBeNull();
  });

  it('returns null when the team link is missing', () => {
    const page = playerPage(
      '<a href="default.asp?p=pt&typID=33">Goblin Linemen</a>',
    );
    expect(parser.extractPlayer(page)).toBeNull();
  });

  it('returns null for a page with no relevant links', () => {
    const page = playerPage('<a href="default.asp?p=tl#16">Orc Team</a>');
    expect(parser.extractPlayer(page)).toBeNull();
  });
});
