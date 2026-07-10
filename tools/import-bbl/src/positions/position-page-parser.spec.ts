import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';

import type { BblPage } from '../source/bbl-page';
import { PositionPageParser } from './position-page-parser';

function positionPage(html: string, typID = '33'): BblPage {
  return { type: 'pt', params: { typID }, load: () => load(html) };
}

const parser = new PositionPageParser();

describe('PositionPageParser', () => {
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
});
