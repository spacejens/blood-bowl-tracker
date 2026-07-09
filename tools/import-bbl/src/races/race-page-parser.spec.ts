import { describe, it, expect } from 'vitest';
import { load } from 'cheerio';
import { RacePageParser } from './race-page-parser';
import type { BblPage } from '../source/bbl-page';

function teamPage(html: string): BblPage {
  return { type: 'tm', params: { t: 'x' }, load: () => load(html) };
}

const parser = new RacePageParser();

describe('RacePageParser', () => {
  it('extracts the numeric BBL id and name from the race link', () => {
    const page = teamPage(
      '<table><tr>' +
        '<td align="right">Race:</td>' +
        '<td>&nbsp;<b><a href="default.asp?p=tl#16">Orc Team</a></b></td>' +
        '</tr></table>',
    );
    expect(parser.extractRace(page)).toEqual({ id: '16', name: 'Orc Team' });
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
