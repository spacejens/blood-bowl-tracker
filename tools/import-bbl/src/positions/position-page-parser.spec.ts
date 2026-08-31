import { Test } from '@nestjs/testing';
import { load } from 'cheerio';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { BblPage } from '../source/bbl-page.types';
import { NormalizeExtractedTextService } from '../source/normalize-extracted-text.service';
import { PositionPageParser } from './position-page-parser';

function positionPage(html: string, typID = '33'): BblPage {
  return { type: 'pt', params: { typID }, load: () => load(html) };
}

describe('PositionPageParser', () => {
  let parser: PositionPageParser;
  let normalizeText: MockProxy<NormalizeExtractedTextService>;

  beforeEach(async () => {
    normalizeText = mock<NormalizeExtractedTextService>();
    normalizeText.normalize.mockImplementation((s: string) =>
      s.replace(/\s+/g, ' ').trim(),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionPageParser,
        { provide: NormalizeExtractedTextService, useValue: normalizeText },
      ],
    }).compile();
    parser = moduleRef.get(PositionPageParser);
  });

  it('extracts the name and a single race', () => {
    const page = positionPage(
      '<h1>Orc Lineman</h1>' +
        '<div>Can play for:</div>' +
        '<a href="default.asp?p=tl#16">Orc Team</a>',
      '10',
    );
    expect(parser.extractPosition(page)).toEqual({
      typId: '10',
      name: 'Orc Lineman',
      races: [{ bblId: '16', name: 'Orc Team' }],
      isStarPlayer: false,
      characteristics: null,
    });
  });

  it('extracts multiple races for a multi-race position', () => {
    const page = positionPage(
      '<h1>Goblin Linemen</h1>' +
        '<div>Can play for:</div>' +
        '<a href="default.asp?p=tl#48">College of Shadow</a>' +
        '<a href="default.asp?p=tl#7">Goblin Team</a>',
      '33',
    );
    expect(parser.extractPosition(page)).toEqual({
      typId: '33',
      name: 'Goblin Linemen',
      races: [
        { bblId: '48', name: 'College of Shadow' },
        { bblId: '7', name: 'Goblin Team' },
      ],
      isStarPlayer: false,
      characteristics: null,
    });
  });

  it('returns an empty races array when no race is listed', () => {
    const page = positionPage(
      '<h1>Norse Catchers</h1><div>Can play for:</div>',
      '121',
    );
    expect(parser.extractPosition(page)).toEqual({
      typId: '121',
      name: 'Norse Catchers',
      races: [],
      isStarPlayer: false,
      characteristics: null,
    });
  });

  it('deduplicates a race listed twice', () => {
    const page = positionPage(
      '<h1>Lineman</h1>' +
        '<a href="default.asp?p=tl#16">Orc Team</a>' +
        '<a href="default.asp?p=tl#16">Orc Team</a>',
      '10',
    );
    expect(parser.extractPosition(page)?.races).toEqual([
      { bblId: '16', name: 'Orc Team' },
    ]);
  });

  it('returns null when the position page has no <h1> name', () => {
    const page = positionPage(
      '<div>Can play for:</div><a href="default.asp?p=tl#16">Orc Team</a>',
      '10',
    );
    expect(parser.extractPosition(page)).toBeNull();
  });

  it('returns null when the typID param is missing', () => {
    const page: BblPage = {
      type: 'pt',
      params: {},
      load: () => load('<h1>Orc Lineman</h1>'),
    };
    expect(parser.extractPosition(page)).toBeNull();
  });

  it('flags a star player when the None (star player) marker is present', () => {
    const page = positionPage(
      '<h1>Wilhelm Chaney</h1>' +
        '<table><tr><td>Skills:</td><td>None (star player)</td></tr></table>',
      '99',
    );
    expect(parser.extractPosition(page)?.isStarPlayer).toBe(true);
  });

  it('does not flag a star player when the marker is absent', () => {
    const page = positionPage(
      '<h1>Orc Lineman</h1>' + '<a href="default.asp?p=tl#16">Orc Team</a>',
      '10',
    );
    expect(parser.extractPosition(page)?.isStarPlayer).toBe(false);
  });

  it('normalizes internal non-breaking spaces in the name and race name', () => {
    const page = positionPage(
      '<h1>Orc&nbsp;Lineman</h1>' +
        '<div>Can play for:</div>' +
        '<a href="default.asp?p=tl#16">Orc&nbsp;Team</a>',
      '10',
    );
    expect(parser.extractPosition(page)).toEqual({
      typId: '10',
      name: 'Orc Lineman',
      races: [{ bblId: '16', name: 'Orc Team' }],
      isStarPlayer: false,
      characteristics: null,
    });
  });

  const CHARACTERISTICS_TABLE =
    '<table>' +
    '<tr class="trlisthead">' +
    '<th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th><th>Skills</th>' +
    '</tr>' +
    '<tr class="trborder">' +
    '<td>6</td><td>4</td><td>4+</td><td>6+</td><td>10+</td><td>Thick Skull</td>' +
    '</tr>' +
    '</table>';

  it('extracts the characteristics line, stripping the plus suffixes', () => {
    const page = positionPage(
      '<h1>Bull Centaur</h1>' +
        '<a href="default.asp?p=tl#16">Dwarf Team</a>' +
        CHARACTERISTICS_TABLE,
      '10',
    );
    expect(parser.extractPosition(page)?.characteristics).toEqual({
      move: 6,
      strength: 4,
      agility: 4,
      passing: 6,
      armour: 10,
    });
  });

  it('parses a dash Passing cell as null', () => {
    const page = positionPage(
      '<h1>Bonobo</h1>' +
        '<a href="default.asp?p=tl#16">College of Beasts</a>' +
        '<table>' +
        '<tr class="trlisthead">' +
        '<th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th><th>Skills</th>' +
        '</tr>' +
        '<tr class="trborder">' +
        '<td>6</td><td>3</td><td>3+</td><td>-</td><td>8+</td><td>Loner</td>' +
        '</tr>' +
        '</table>',
      '219',
    );
    expect(parser.extractPosition(page)?.characteristics).toEqual({
      move: 6,
      strength: 3,
      agility: 3,
      passing: null,
      armour: 8,
    });
  });

  it('returns null characteristics when the page has no characteristics table', () => {
    const page = positionPage(
      '<h1>Orc Lineman</h1><a href="default.asp?p=tl#16">Orc Team</a>',
      '10',
    );
    expect(parser.extractPosition(page)?.characteristics).toBeNull();
  });

  it('ignores other trlisthead tables and reads the MA/ST/AG/PA/AV one', () => {
    const page = positionPage(
      '<h1>Orc Lineman</h1>' +
        '<table><tr class="trlisthead"><th>Season</th><th>Team</th></tr>' +
        '<tr class="trborder"><td>2019</td><td>Orcland</td></tr></table>' +
        CHARACTERISTICS_TABLE,
      '10',
    );
    expect(parser.extractPosition(page)?.characteristics).toEqual({
      move: 6,
      strength: 4,
      agility: 4,
      passing: 6,
      armour: 10,
    });
  });

  it('returns null characteristics when a non-Passing cell is unreadable', () => {
    const page = positionPage(
      '<h1>Orc Lineman</h1>' +
        '<table>' +
        '<tr class="trlisthead">' +
        '<th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th><th>Skills</th>' +
        '</tr>' +
        '<tr class="trborder">' +
        '<td>6</td><td>?</td><td>3+</td><td>4+</td><td>9+</td><td></td>' +
        '</tr>' +
        '</table>',
      '10',
    );
    expect(parser.extractPosition(page)?.characteristics).toBeNull();
  });

  it('returns null characteristics when the Passing cell is unreadable garbage, not a dash', () => {
    const page = positionPage(
      '<h1>Orc Lineman</h1>' +
        '<table>' +
        '<tr class="trlisthead">' +
        '<th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th><th>Skills</th>' +
        '</tr>' +
        '<tr class="trborder">' +
        '<td>6</td><td>4</td><td>3+</td><td>?</td><td>9+</td><td></td>' +
        '</tr>' +
        '</table>',
      '10',
    );
    expect(parser.extractPosition(page)?.characteristics).toBeNull();
  });
});
