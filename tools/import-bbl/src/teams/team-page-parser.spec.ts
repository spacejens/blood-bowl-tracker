import { Test } from '@nestjs/testing';
import { load } from 'cheerio';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { BblPage } from '../source/bbl-page.types';
import { NormalizeExtractedTextService } from '../source/normalize-extracted-text.service';
import { TeamPageParser } from './team-page-parser';

function teamPage(id: string, html: string): BblPage {
  return { type: 'tm', params: { t: id }, load: () => load(html) };
}

describe('TeamPageParser', () => {
  let parser: TeamPageParser;
  let normalizeText: MockProxy<NormalizeExtractedTextService>;

  beforeEach(async () => {
    normalizeText = mock<NormalizeExtractedTextService>();
    normalizeText.normalize.mockImplementation((s: string) =>
      s.replace(/\s+/g, ' ').trim(),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        TeamPageParser,
        { provide: NormalizeExtractedTextService, useValue: normalizeText },
      ],
    }).compile();
    parser = moduleRef.get(TeamPageParser);
  });

  it('extracts the team id from params.t and the name from the <h1>', () => {
    const page = teamPage('40g', '<h1>40 grinders</h1>');
    expect(parser.extractTeam(page)).toEqual({
      id: '40g',
      name: '40 grinders',
    });
  });

  it('preserves the exact team name including casing and spacing', () => {
    const page = teamPage('äng', '<h1>Ängelholm Assassins</h1>');
    expect(parser.extractTeam(page)).toEqual({
      id: 'äng',
      name: 'Ängelholm Assassins',
    });
  });

  it('returns null when params.t is missing', () => {
    const page: BblPage = {
      type: 'tm',
      params: {},
      load: () => load('<h1>40 grinders</h1>'),
    };
    expect(parser.extractTeam(page)).toBeNull();
  });

  it('returns null when the page has no <h1>', () => {
    const page = teamPage('40g', '<div>no heading here</div>');
    expect(parser.extractTeam(page)).toBeNull();
  });

  it('returns null when the <h1> is empty', () => {
    const page = teamPage('40g', '<h1>  </h1>');
    expect(parser.extractTeam(page)).toBeNull();
  });
});
