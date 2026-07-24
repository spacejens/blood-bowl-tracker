import { Test } from '@nestjs/testing';
import { load } from 'cheerio';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { BblPage } from '../source/bbl-page.types';
import { NormalizeExtractedTextService } from '../source/normalize-extracted-text.service';
import { RacePageParser } from './race-page-parser';

function teamPage(html: string): BblPage {
  return { type: 'tm', params: { t: 'x' }, load: () => load(html) };
}

describe('RacePageParser', () => {
  let parser: RacePageParser;
  let normalizeText: MockProxy<NormalizeExtractedTextService>;

  beforeEach(async () => {
    normalizeText = mock<NormalizeExtractedTextService>();
    normalizeText.normalize.mockImplementation((s: string) =>
      s.replace(/\s+/g, ' ').trim(),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        RacePageParser,
        { provide: NormalizeExtractedTextService, useValue: normalizeText },
      ],
    }).compile();
    parser = moduleRef.get(RacePageParser);
  });

  it('extracts the numeric BBL id and name from the race link', () => {
    const page = teamPage(
      '<table><tr>' +
        '<td align="right">Race:</td>' +
        '<td>&nbsp;<b><a href="default.asp?p=tl#16">Orc Team</a></b></td>' +
        '</tr></table>',
    );
    expect(parser.extractRace(page)).toEqual({ id: '16', name: 'Orc Team' });
  });

  it('normalizes an internal non-breaking space in the race name', () => {
    const page = teamPage(
      '<table><tr><td>Race:</td>' +
        '<td>&nbsp;<b><a href="default.asp?p=tl#3">Chaos&nbsp;Dwarf&nbsp;Team</a></b></td>' +
        '</tr></table>',
    );
    expect(parser.extractRace(page)).toEqual({
      id: '3',
      name: 'Chaos Dwarf Team',
    });
  });

  it('preserves the exact race name including casing and spacing', () => {
    const page = teamPage(
      '<table><tr><td>Race:</td>' +
        '<td><b><a href="default.asp?p=tl#3">Chaos Dwarf Team</a></b></td>' +
        '</tr></table>',
    );
    expect(parser.extractRace(page)).toEqual({
      id: '3',
      name: 'Chaos Dwarf Team',
    });
  });

  it('returns null when there is no Race field', () => {
    const page = teamPage(
      '<table><tr><td>Coach:</td><td>Hugo E</td></tr></table>',
    );
    expect(parser.extractRace(page)).toBeNull();
  });

  it('returns null when the race value is empty', () => {
    const page = teamPage(
      '<table><tr><td>Race:</td><td>&nbsp;</td></tr></table>',
    );
    expect(parser.extractRace(page)).toBeNull();
  });

  it('returns null when the race has a name but no link to derive an id from', () => {
    const page = teamPage(
      '<table><tr><td>Race:</td><td><b>Orc Team</b></td></tr></table>',
    );
    expect(parser.extractRace(page)).toBeNull();
  });
});
