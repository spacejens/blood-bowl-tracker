import type { ImportError } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { mockBblSourceReader } from '../shared/bbl-source-reader-mock.test-helpers';
import type { BblPage } from '../source/bbl-page.types';
import { BblSourceReader } from '../source/bbl-source-reader';
import { PageParseErrorService } from '../source/page-parse-error.service';
import { BblCompetitionTrophyReaderService } from './bbl-competition-trophy-reader.service';
import type { CompetitionTrophyRows } from './competition-trophy-page-parser';
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

const NO_ROWS: CompetitionTrophyRows = { teamTrophies: [], playerPrizes: [] };

function rowsWith(teamCode: string): CompetitionTrophyRows {
  return {
    teamTrophies: [{ label: 'Major 1st', teamCode }],
    playerPrizes: [{ label: 'Top Scorer', pid: '102' }],
  };
}

/**
 * A parser mock that answers `extractRows` from `rowsById` and returns a
 * canned placement derived from nothing but the mock's own seed. The parser's
 * real label-to-placement logic is covered by
 * competition-trophy-page-parser.spec.ts; this spec only checks that the
 * reader feeds `extractRows`' team rows into `placementsFrom` and returns the
 * result keyed by competition id.
 */
function makeParser(
  rowsById: Record<string, CompetitionTrophyRows>,
): MockProxy<CompetitionTrophyPageParser> {
  const parser = mock<CompetitionTrophyPageParser>();
  parser.extractRows.mockImplementation((p) => rowsById[p.params.s] ?? NO_ROWS);
  parser.placementsFrom.mockReturnValue({ first: 'canned' });
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
  it('keys rows by competition id, deduping repeated s pages', async () => {
    const parser = makeParser({ '1': rowsWith('sew') });
    const { service } = await makeService({
      reader: mockBblSourceReader([page({ s: '1' }), page({ s: '1' })]),
      parser,
    });
    const errors: ImportError[] = [];

    const result = await service.getRowsByCompetitionId(errors);

    expect(result.get('1')).toEqual(rowsWith('sew'));
    expect(parser.extractRows).toHaveBeenCalledTimes(1);
    expect(errors).toHaveLength(0);
  });

  it('derives placements from the team trophy rows', async () => {
    const parser = makeParser({ '1': rowsWith('sew') });
    const { service } = await makeService({
      reader: mockBblSourceReader([page({ s: '1' })]),
      parser,
    });

    const result = await service.getPlacementsByCompetitionId([]);

    expect(result.get('1')).toEqual({ first: 'canned' });
    expect(parser.placementsFrom).toHaveBeenCalledWith(
      rowsWith('sew').teamTrophies,
    );
  });

  it('skips a page with no s param', async () => {
    const { service } = await makeService({
      reader: mockBblSourceReader([page({}), page({ s: '1' })]),
      parser: makeParser({ '1': rowsWith('sew') }),
    });

    const result = await service.getRowsByCompetitionId([]);

    expect([...result.keys()]).toEqual(['1']);
  });

  it('memoizes: a second call does not re-read the source', async () => {
    const reader = mockBblSourceReader([page({ s: '1' })]);
    const pagesSpy = vi.spyOn(reader, 'pages');
    const { service } = await makeService({
      reader,
      parser: makeParser({ '1': rowsWith('sew') }),
    });

    await service.getRowsByCompetitionId([]);
    await service.getPlacementsByCompetitionId([]);

    expect(pagesSpy).toHaveBeenCalledTimes(1);
  });

  it('records an error and continues when a page fails to parse', async () => {
    const parser = mock<CompetitionTrophyPageParser>();
    parser.extractRows.mockImplementation(() => {
      throw new Error('bad sr page');
    });
    const { service, pageParseError } = await makeService({
      reader: mockBblSourceReader([page({ s: '1' })]),
      parser,
    });
    const errors: ImportError[] = [];

    const result = await service.getRowsByCompetitionId(errors);

    expect(result.size).toBe(0);
    expect(errors).toEqual([CANNED_PAGE_PARSE_ERROR]);
    expect(pageParseError.build).toHaveBeenCalledWith(
      { s: '1' },
      'competition trophy',
      new Error('bad sr page'),
    );
  });
});
