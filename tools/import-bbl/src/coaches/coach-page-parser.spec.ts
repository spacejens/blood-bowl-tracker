import { Test } from '@nestjs/testing';
import { load } from 'cheerio';
import { beforeEach, describe, expect, it } from 'vitest';

import type { BblPage } from '../source/bbl-page.types';
import { NormalizeExtractedTextService } from '../source/normalize-extracted-text.service';
import { CoachPageParser } from './coach-page-parser';

function teamPage(html: string): BblPage {
  return { type: 'tm', params: { t: 'x' }, load: () => load(html) };
}

describe('CoachPageParser', () => {
  let parser: CoachPageParser;

  beforeEach(async () => {
    // NormalizeExtractedTextService is pure and dependency-free, so it is
    // passed real rather than mocked with a copy of its algorithm.
    const moduleRef = await Test.createTestingModule({
      providers: [CoachPageParser, NormalizeExtractedTextService],
    }).compile();
    parser = moduleRef.get(CoachPageParser);
  });

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

  it('preserves accented characters in the name', () => {
    const page = teamPage(
      '<table><tr><td>Coach:</td><td><b>Göran Åke</b></td></tr></table>',
    );
    expect(parser.extractCoach(page)).toEqual({ name: 'Göran Åke' });
  });

  it('folds a curly apostrophe in the name to a straight one', () => {
    const page = teamPage(
      '<table><tr><td>Coach:</td><td><b>Bob O’Hara</b></td></tr></table>',
    );
    expect(parser.extractCoach(page)).toEqual({ name: "Bob O'Hara" });
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
