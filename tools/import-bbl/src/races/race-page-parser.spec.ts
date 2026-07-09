import { describe, it, expect } from 'vitest';
import { load } from 'cheerio';
import { RacePageParser } from './race-page-parser';
import type { BblPage } from '../source/bbl-page';

function teamPage(html: string): BblPage {
  return { type: 'tm', params: { t: 'x' }, load: () => load(html) };
}

const parser = new RacePageParser();

describe('RacePageParser', () => {
  it('extracts the race name from a team page', () => {
    const page = teamPage(
      '<table><tr>' +
        '<td align="right">Race:</td>' +
        '<td>&nbsp;<b><span>Orc</span></b></td>' +
        '</tr></table>',
    );
    expect(parser.extractRace(page)).toEqual({ name: 'Orc' });
  });

  it('preserves the exact race name including casing and spacing', () => {
    const page = teamPage(
      '<table><tr><td>Race:</td><td><b>Chaos Dwarf</b></td></tr></table>',
    );
    expect(parser.extractRace(page)).toEqual({ name: 'Chaos Dwarf' });
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
});
