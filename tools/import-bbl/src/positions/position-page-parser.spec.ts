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
    });
  });
});
