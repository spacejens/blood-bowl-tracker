import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';

import type { BblPage } from '../source/bbl-page.types';
import { RaceListPageParser } from './race-list-page-parser';

function listPage(html: string): BblPage {
  return { type: 'tl', params: {}, load: () => load(html) };
}

import { NormalizeExtractedTextService } from '../source/normalize-extracted-text.service';

const normalizeText = new NormalizeExtractedTextService();
const parser = new RaceListPageParser(normalizeText);

describe('RaceListPageParser', () => {
  it('extracts each race from its numeric anchor and the following <b> heading', () => {
    const page = listPage(
      '<a name="CollegeofShadow"></a><a name="48"></a>' +
        '<table><tr><td><img><b>College of Shadow</b></td></tr></table>' +
        '<a name="CollegeofLight"></a><a name="50"></a>' +
        '<table><tr><td><b>College of Light</b></td></tr></table>',
    );
    expect(parser.extractRaces(page)).toEqual([
      { id: '48', name: 'College of Shadow' },
      { id: '50', name: 'College of Light' },
    ]);
  });

  it('normalizes an internal non-breaking space in the race name', () => {
    const page = listPage(
      '<a name="48"></a><b>College&nbsp;of&nbsp;Shadow</b>',
    );
    expect(parser.extractRaces(page)).toEqual([
      { id: '48', name: 'College of Shadow' },
    ]);
  });

  it('ignores roster <b> rows that follow the race-name <b>', () => {
    const page = listPage(
      '<a name="48"></a><b>College of Shadow</b>' +
        '<b>Linemen (0-16):</b> Goblin Linemen' +
        '<a name="50"></a><b>College of Light</b>',
    );
    expect(parser.extractRaces(page)).toEqual([
      { id: '48', name: 'College of Shadow' },
      { id: '50', name: 'College of Light' },
    ]);
  });

  it('returns an empty array when the page has no anchors', () => {
    const page = listPage('<table><tr><td>no races here</td></tr></table>');
    expect(parser.extractRaces(page)).toEqual([]);
  });

  it('ignores anchors whose name is not all digits', () => {
    const page = listPage(
      '<a name="CollegeofShadow"></a><b>College of Shadow</b>',
    );
    expect(parser.extractRaces(page)).toEqual([]);
  });

  it('ignores an anchor with an empty name attribute', () => {
    const page = listPage('<a name=""></a><b>College of Shadow</b>');
    expect(parser.extractRaces(page)).toEqual([]);
  });

  it('skips a numeric anchor with no following <b>', () => {
    const page = listPage(
      '<a name="48"></a><table><tr><td>nothing</td></tr></table>',
    );
    expect(parser.extractRaces(page)).toEqual([]);
  });

  it('skips a numeric anchor whose following <b> is empty', () => {
    const page = listPage('<a name="48"></a><b>   </b>');
    expect(parser.extractRaces(page)).toEqual([]);
  });
});
