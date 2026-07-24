import { Test } from '@nestjs/testing';
import { load } from 'cheerio';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { BblPage } from '../source/bbl-page.types';
import { NormalizeExtractedTextService } from '../source/normalize-extracted-text.service';
import { CompetitionListPageParser } from './competition-list-page-parser';

function listPage(html: string): BblPage {
  return { type: 'se', params: { s: '66' }, load: () => load(html) };
}

describe('CompetitionListPageParser', () => {
  let parser: CompetitionListPageParser;
  let normalizeText: MockProxy<NormalizeExtractedTextService>;

  beforeEach(async () => {
    normalizeText = mock<NormalizeExtractedTextService>();
    normalizeText.normalize.mockImplementation((s: string) =>
      s.replace(/\s+/g, ' ').trim(),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        CompetitionListPageParser,
        { provide: NormalizeExtractedTextService, useValue: normalizeText },
      ],
    }).compile();
    parser = moduleRef.get(CompetitionListPageParser);
  });

  it('extracts each competition id and name from the se-option dropdown', () => {
    const page = listPage(
      '<select>' +
        '<option  value="default.asp?p=se&s=73">Major Season 24</option>' +
        '<option  value="default.asp?p=se&s=69">Dungeon Bowl 1</option>' +
        '</select>',
    );

    expect(parser.extractCompetitions(page)).toEqual([
      { bblId: '73', name: 'Major Season 24' },
      { bblId: '69', name: 'Dungeon Bowl 1' },
    ]);
  });

  it('ignores options that are not p=se competition links', () => {
    const page = listPage(
      '<select>' +
        '<option value="default.asp?p=ma&so=t">Sort by team</option>' +
        '<option value="default.asp?p=se&s=57">Exhibition-poolen</option>' +
        '</select>',
    );

    expect(parser.extractCompetitions(page)).toEqual([
      { bblId: '57', name: 'Exhibition-poolen' },
    ]);
  });

  it('skips options with an empty name and deduplicates by id', () => {
    const page = listPage(
      '<option  value="default.asp?p=se&s=10"></option>' +
        '<option  value="default.asp?p=se&s=11">Minor Season 5</option>' +
        '<option  value="default.asp?p=se&s=11">Minor Season 5</option>',
    );

    expect(parser.extractCompetitions(page)).toEqual([
      { bblId: '11', name: 'Minor Season 5' },
    ]);
  });

  it('returns an empty array when there are no se options', () => {
    const page = listPage('<select><option value="x">none</option></select>');
    expect(parser.extractCompetitions(page)).toEqual([]);
  });
});
