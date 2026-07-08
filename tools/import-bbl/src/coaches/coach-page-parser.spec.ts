import { describe, it, expect } from 'vitest';
import { load } from 'cheerio';
import { CoachPageParser } from './coach-page-parser';
import type { BblPage } from '../source/bbl-page';

function teamPage(html: string): BblPage {
  return { type: 'tm', params: { t: 'x' }, load: () => load(html) };
}

const parser = new CoachPageParser();

describe('CoachPageParser', () => {
  it('extracts the coach name from a team page', () => {
    const page = teamPage(
      '<table><tr>' +
        '<td align="right">Coach:</td>' +
        '<td>&nbsp;<b><span>Hugo E</span></b></td>' +
        '</tr></table>',
    );
    expect(parser.extractCoach(page)).toEqual({ name: 'Hugo E' });
  });

  it('preserves the exact name including casing and spacing', () => {
    const page = teamPage(
      '<table><tr><td>Coach:</td><td><b>Mc Beef</b></td></tr></table>',
    );
    expect(parser.extractCoach(page)).toEqual({ name: 'Mc Beef' });
  });

  it('decodes and preserves Latin-1 characters in the name', () => {
    const page = teamPage(
      '<table><tr><td>Coach:</td><td><b>Göran Åke</b></td></tr></table>',
    );
    expect(parser.extractCoach(page)).toEqual({ name: 'Göran Åke' });
  });

  it('returns null when there is no Coach field', () => {
    const page = teamPage('<table><tr><td>Race:</td><td>Orc</td></tr></table>');
    expect(parser.extractCoach(page)).toBeNull();
  });

  it('returns null when the coach value is empty', () => {
    const page = teamPage(
      '<table><tr><td>Coach:</td><td>&nbsp;</td></tr></table>',
    );
    expect(parser.extractCoach(page)).toBeNull();
  });
});
