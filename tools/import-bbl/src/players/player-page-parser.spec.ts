import { Test } from '@nestjs/testing';
import { load } from 'cheerio';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { BblPage } from '../source/bbl-page.types';
import { NormalizeExtractedTextService } from '../source/normalize-extracted-text.service';
import { PlayerPageParser } from './player-page-parser';

function playerPage(html: string, pid = '5'): BblPage {
  return { type: 'pl', params: { pid }, load: () => load(html) };
}

describe('PlayerPageParser', () => {
  let parser: PlayerPageParser;
  let normalizeText: MockProxy<NormalizeExtractedTextService>;

  beforeEach(async () => {
    normalizeText = mock<NormalizeExtractedTextService>();
    normalizeText.normalize.mockImplementation((s: string) =>
      s.replace(/\s+/g, ' ').trim(),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerPageParser,
        { provide: NormalizeExtractedTextService, useValue: normalizeText },
      ],
    }).compile();
    parser = moduleRef.get(PlayerPageParser);
  });

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
      sppTotal: null,
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
      sppTotal: null,
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
      sppTotal: null,
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
      sppTotal: null,
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

  const UNSPENT_SPP_ROW =
    '<table><tr>' +
    '<td class="small">Unspent SPP:</td>' +
    '<td class="esmall" align="center">5</td>' +
    '<td class="esmall"><span class="opaque50">(<a href=\'default.asp?p=mp&act=spp&pid=5\'>11</a>)</span></td>' +
    '</tr></table>';

  it('scrapes the career SPP total from the Unspent SPP row', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        '<a href="default.asp?p=pt&typID=33">Goblin Linemen</a>' +
        '<a href="default.asp?p=tm&t=knu">Knights</a>' +
        UNSPENT_SPP_ROW,
    );
    expect(parser.extractPlayer(page)?.sppTotal).toBe(11);
  });

  it('scrapes a zero career total that carries no breakdown link', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        '<a href="default.asp?p=pt&typID=33">Goblin Linemen</a>' +
        '<a href="default.asp?p=tm&t=knu">Knights</a>' +
        '<table><tr><td class="small">Unspent SPP:</td>' +
        '<td class="esmall" align="center">0</td>' +
        '<td class="esmall"><span class="opaque50">(0)</span></td></tr></table>',
    );
    expect(parser.extractPlayer(page)?.sppTotal).toBe(0);
  });

  it('ignores the unspent figure, including a negative one', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        '<a href="default.asp?p=pt&typID=33">Goblin Linemen</a>' +
        '<a href="default.asp?p=tm&t=knu">Knights</a>' +
        '<table><tr><td class="small">Unspent SPP:</td>' +
        '<td class="esmall" align="center">-7</td>' +
        '<td class="esmall"><span class="opaque50">(<a href=\'x\'>31</a>)</span></td></tr></table>',
    );
    expect(parser.extractPlayer(page)?.sppTotal).toBe(31);
  });

  it('returns a null career total when the page has no Unspent SPP row', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        '<a href="default.asp?p=pt&typID=33">Goblin Linemen</a>' +
        '<a href="default.asp?p=tm&t=knu">Knights</a>',
    );
    expect(parser.extractPlayer(page)?.sppTotal).toBeNull();
  });

  it('skips over unrelated td cells while looking for the Unspent SPP row', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        '<a href="default.asp?p=pt&typID=33">Goblin Linemen</a>' +
        '<a href="default.asp?p=tm&t=knu">Knights</a>' +
        '<table><tr><td class="small">Some other stat:</td>' +
        '<td class="esmall">99</td></tr></table>' +
        UNSPENT_SPP_ROW,
    );
    expect(parser.extractPlayer(page)?.sppTotal).toBe(11);
  });

  it('returns a null career total when the row carries no parenthesized figure', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        '<a href="default.asp?p=pt&typID=33">Goblin Linemen</a>' +
        '<a href="default.asp?p=tm&t=knu">Knights</a>' +
        '<table><tr><td class="small">Unspent SPP:</td>' +
        '<td class="esmall" align="center">5</td></tr></table>',
    );
    expect(parser.extractPlayer(page)?.sppTotal).toBeNull();
  });
});
