import type { ImportError } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { mockBblSourceReader } from '../shared/bbl-source-reader-mock.test-helpers';
import type { BblPage } from '../source/bbl-page.types';
import { BblSourceReader } from '../source/bbl-source-reader';
import { PageParseErrorService } from '../source/page-parse-error.service';
import { BblCompetitionTrophyReaderService } from './bbl-competition-trophy-reader.service';
import type { CompetitionTrophyPlacements } from './competition-trophy-page-parser';
import { CompetitionTrophyPageParser } from './competition-trophy-page-parser';

function page(params: Record<string, string>): BblPage {
  return {
    type: 'sr',
    params,
    load: () => {
      throw new Error('load() should not be called in this test');
    },
  };
}

function makeParser(
  placementsById: Record<string, CompetitionTrophyPlacements>,
): MockProxy<CompetitionTrophyPageParser> {
  const parser = mock<CompetitionTrophyPageParser>();
  parser.extractPlacements.mockImplementation(
    (p) => placementsById[p.params.s] ?? {},
  );
  return parser;
}

/**
 * The canned ImportError the mocked PageParseErrorService.build returns.
 * PageParseErrorService's own message template is covered by
 * ../source/page-parse-error.service.spec.ts. This spec asserts only what
 * BblCompetitionTrophyReaderService hands to build() and that it pushes
 * build()'s return value onto the errors list.
 */
const CANNED_PAGE_PARSE_ERROR: ImportError = {
  item: { page: 'canned' },
  message: 'canned page parse error',
};

async function makeService(options: {
  reader: BblSourceReader;
  parser: MockProxy<CompetitionTrophyPageParser>;
}): Promise<{
  service: BblCompetitionTrophyReaderService;
  pageParseError: MockProxy<PageParseErrorService>;
}> {
  const pageParseError = mock<PageParseErrorService>();
  pageParseError.build.mockReturnValue(CANNED_PAGE_PARSE_ERROR);
  const moduleRef = await Test.createTestingModule({
    providers: [
      BblCompetitionTrophyReaderService,
      { provide: BblSourceReader, useValue: options.reader },
      { provide: CompetitionTrophyPageParser, useValue: options.parser },
      { provide: PageParseErrorService, useValue: pageParseError },
    ],
  }).compile();
  return {
    service: moduleRef.get(BblCompetitionTrophyReaderService),
    pageParseError,
  };
}

describe('BblCompetitionTrophyReaderService', () => {
  it('keys placements by competition id, deduping repeated s pages', async () => {
    const parser = makeParser({ '1': { first: 'sew', second: 'vor' } });
    const { service } = await makeService({
      reader: mockBblSourceReader([page({ s: '1' }), page({ s: '1' })]),
      parser,
    });
    const errors: ImportError[] = [];

    const result = await service.getPlacementsByCompetitionId(errors);

    expect(result.get('1')).toEqual({ first: 'sew', second: 'vor' });
    expect(parser.extractPlacements).toHaveBeenCalledTimes(1);
    expect(errors).toHaveLength(0);
  });

  it('skips a page with no s param', async () => {
    const parser = makeParser({ '1': { first: 'sew' } });
    const { service } = await makeService({
      reader: mockBblSourceReader([page({}), page({ s: '1' })]),
      parser,
    });

    const result = await service.getPlacementsByCompetitionId([]);

    expect([...result.keys()]).toEqual(['1']);
  });

  it('memoizes: a second call does not re-read the source', async () => {
    const reader = mockBblSourceReader([page({ s: '1' })]);
    const pagesSpy = vi.spyOn(reader, 'pages');
    const { service } = await makeService({
      reader,
      parser: makeParser({ '1': { first: 'sew' } }),
    });

    await service.getPlacementsByCompetitionId([]);
    await service.getPlacementsByCompetitionId([]);

    expect(pagesSpy).toHaveBeenCalledTimes(1);
  });

  it('records an error and continues when a page fails to parse', async () => {
    const parser = mock<CompetitionTrophyPageParser>();
    parser.extractPlacements.mockImplementation(() => {
      throw new Error('bad sr page');
    });
    const { service, pageParseError } = await makeService({
      reader: mockBblSourceReader([page({ s: '1' })]),
      parser,
    });
    const errors: ImportError[] = [];

    const result = await service.getPlacementsByCompetitionId(errors);

    expect(result.size).toBe(0);
    expect(errors).toEqual([CANNED_PAGE_PARSE_ERROR]);
    expect(pageParseError.build).toHaveBeenCalledWith(
      { s: '1' },
      'competition trophy',
      new Error('bad sr page'),
    );
  });
});
