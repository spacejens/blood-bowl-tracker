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

  /** The two links every player page needs for extractPlayer to succeed. */
  const PLAYER_LINKS =
    '<a href="default.asp?p=pt&typID=33">Goblin Linemen</a>' +
    '<a href="default.asp?p=tm&t=knu">Knights</a>';

  /** A characteristics table with the given five value cells, in column order. */
  function characteristicsTable(...values: string[]): string {
    return (
      '<table class="tblist">' +
      '<tr class="trlisthead">' +
      '<th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th><th>Skills</th>' +
      '</tr>' +
      '<tr>' +
      values.map((v) => `<td>${v}</td>`).join('') +
      '<td>Sure Hands</td>' +
      '</tr>' +
      '</table>'
    );
  }

  it('extracts the pid, name, position typId and team code', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        '<a href="default.asp?p=pt&typID=33">Goblin Linemen</a>' +
        '<a href="default.asp?p=tm&t=knu">Knights</a>' +
        characteristicsTable('5', '3', '3+', '4+', '8+'),
      '5',
    );
    expect(parser.extractPlayer(page)).toEqual({
      pid: '5',
      name: 'Griff Oberwald',
      typId: '33',
      teamCode: 'knu',
      sppTotal: null,
      characteristics: {
        move: 5,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 8,
      },
    });
  });

  it('extracts a team code containing non-ASCII characters', () => {
    const page = playerPage(
      '<h1>Aspgren</h1>' +
        '<a href="default.asp?p=pt&typID=169">Hafling Treeman</a>' +
        "<a href='default.asp?p=tm&t=gås' style='font-size:11px'>Gåshöjdens BK</a>" +
        characteristicsTable('5', '3', '3+', '4+', '8+'),
    );
    expect(parser.extractPlayer(page)).toEqual({
      pid: '5',
      name: 'Aspgren',
      typId: '169',
      teamCode: 'gås',
      sppTotal: null,
      characteristics: {
        move: 5,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 8,
      },
    });
  });

  it('uses the first position and team links when several are present', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        '<a href="default.asp?p=pt&typID=33">Goblin Linemen</a>' +
        '<a href="default.asp?p=tm&t=knu">Knights</a>' +
        '<a href="default.asp?p=pt&typID=99">Other</a>' +
        '<a href="default.asp?p=tm&t=abc">Other Team</a>' +
        characteristicsTable('5', '3', '3+', '4+', '8+'),
    );
    expect(parser.extractPlayer(page)).toEqual({
      pid: '5',
      name: 'Griff Oberwald',
      typId: '33',
      teamCode: 'knu',
      sppTotal: null,
      characteristics: {
        move: 5,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 8,
      },
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
        '<a href="default.asp?p=tm&t=nyt3">No name no pain!</a>' +
        characteristicsTable('5', '3', '3+', '4+', '8+'),
      '388',
    );
    expect(parser.extractPlayer(page)).toEqual({
      pid: '388',
      name: '',
      typId: '53',
      teamCode: 'nyt3',
      sppTotal: null,
      characteristics: {
        move: 5,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 8,
      },
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
        PLAYER_LINKS +
        UNSPENT_SPP_ROW +
        characteristicsTable('5', '3', '3+', '4+', '8+'),
    );
    expect(parser.extractPlayer(page)?.sppTotal).toBe(11);
  });

  it('scrapes a zero career total that carries no breakdown link', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        PLAYER_LINKS +
        '<table><tr><td class="small">Unspent SPP:</td>' +
        '<td class="esmall" align="center">0</td>' +
        '<td class="esmall"><span class="opaque50">(0)</span></td></tr></table>' +
        characteristicsTable('5', '3', '3+', '4+', '8+'),
    );
    expect(parser.extractPlayer(page)?.sppTotal).toBe(0);
  });

  it('ignores the unspent figure, including a negative one', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        PLAYER_LINKS +
        '<table><tr><td class="small">Unspent SPP:</td>' +
        '<td class="esmall" align="center">-7</td>' +
        '<td class="esmall"><span class="opaque50">(<a href=\'x\'>31</a>)</span></td></tr></table>' +
        characteristicsTable('5', '3', '3+', '4+', '8+'),
    );
    expect(parser.extractPlayer(page)?.sppTotal).toBe(31);
  });

  it('returns a null career total when the page has no Unspent SPP row', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        PLAYER_LINKS +
        characteristicsTable('5', '3', '3+', '4+', '8+'),
    );
    expect(parser.extractPlayer(page)?.sppTotal).toBeNull();
  });

  it('skips over unrelated td cells while looking for the Unspent SPP row', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        PLAYER_LINKS +
        '<table><tr><td class="small">Some other stat:</td>' +
        '<td class="esmall">99</td></tr></table>' +
        UNSPENT_SPP_ROW +
        characteristicsTable('5', '3', '3+', '4+', '8+'),
    );
    expect(parser.extractPlayer(page)?.sppTotal).toBe(11);
  });

  it('returns a null career total when the row carries no parenthesized figure', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        PLAYER_LINKS +
        '<table><tr><td class="small">Unspent SPP:</td>' +
        '<td class="esmall" align="center">5</td></tr></table>' +
        characteristicsTable('5', '3', '3+', '4+', '8+'),
    );
    expect(parser.extractPlayer(page)?.sppTotal).toBeNull();
  });

  it('extracts the characteristics line, stripping the plus suffixes', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        PLAYER_LINKS +
        characteristicsTable('5', '3', '3+', '4+', '8+'),
    );
    expect(parser.extractPlayer(page)?.characteristics).toEqual({
      move: 5,
      strength: 3,
      agility: 3,
      passing: 4,
      armour: 8,
    });
  });

  it('parses a dash Passing cell as null', () => {
    const page = playerPage(
      '<h1>Grashnak</h1>' +
        PLAYER_LINKS +
        characteristicsTable('5', '5', '4+', '-', '10+'),
    );
    expect(parser.extractPlayer(page)?.characteristics).toEqual({
      move: 5,
      strength: 5,
      agility: 4,
      passing: null,
      armour: 10,
    });
  });

  it('finds the characteristics table by its header text, not its position', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        PLAYER_LINKS +
        '<table class="tblist">' +
        '<tr class="trlisthead"><th>Season</th><th>TD</th><th>Cas</th></tr>' +
        '<tr><td>4</td><td>2</td><td>1</td></tr>' +
        '</table>' +
        characteristicsTable('6', '3', '3+', '5+', '9+'),
    );
    expect(parser.extractPlayer(page)?.characteristics).toEqual({
      move: 6,
      strength: 3,
      agility: 3,
      passing: 5,
      armour: 9,
    });
  });

  it('returns null when a non-Passing characteristic cell is unreadable', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        PLAYER_LINKS +
        characteristicsTable('5', '?', '3+', '4+', '8+'),
    );
    expect(parser.extractPlayer(page)).toBeNull();
  });

  it('returns null when the Passing cell is neither a dash nor a number', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        PLAYER_LINKS +
        characteristicsTable('5', '3', '3+', 'n/a', '8+'),
    );
    expect(parser.extractPlayer(page)).toBeNull();
  });

  it('returns null when the value row has fewer cells than the header row', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        PLAYER_LINKS +
        '<table class="tblist">' +
        '<tr class="trlisthead">' +
        '<th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th><th>Skills</th>' +
        '</tr>' +
        '<tr><td>5</td><td>3</td></tr>' +
        '</table>',
    );
    expect(parser.extractPlayer(page)).toBeNull();
  });

  it('returns null when the page has no characteristics table at all', () => {
    const page = playerPage('<h1>Griff Oberwald</h1>' + PLAYER_LINKS);
    expect(parser.extractPlayer(page)).toBeNull();
  });
});
