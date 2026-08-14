import type { ImportError } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { mockBblSourceReader } from '../shared/bbl-source-reader-mock.test-helpers';
import type { BblPage } from '../source/bbl-page.types';
import { BblSourceReader } from '../source/bbl-source-reader';
import { PageParseErrorService } from '../source/page-parse-error.service';
import { BblCompetitionStandingsReaderService } from './bbl-competition-standings-reader.service';
import { CompetitionStandingsPageParser } from './competition-standings-page-parser';

function page(params: Record<string, string>): BblPage {
  return {
    type: 'se',
    params,
    load: () => {
      throw new Error('load() should not be called in this test');
    },
  };
}

function makeParser(
  teamsById: Record<string, string[]>,
): MockProxy<CompetitionStandingsPageParser> {
  const parser = mock<CompetitionStandingsPageParser>();
  parser.extractRegisteredTeamIds.mockImplementation(
    (p) => new Set(teamsById[p.params.s] ?? []),
  );
  return parser;
}

/**
 * The canned ImportError the mocked PageParseErrorService.build returns.
 * PageParseErrorService's own message template — including the
 * `error instanceof Error ? error.message : String(error)` branch — is covered
 * by ../source/page-parse-error.service.spec.ts. This spec asserts only what
 * BblCompetitionStandingsReaderService hands to build() and that it pushes
 * build()'s return value onto the errors list.
 */
const CANNED_PAGE_PARSE_ERROR: ImportError = {
  item: { page: 'canned' },
  message: 'canned page parse error',
};

async function makeService(options: {
  reader: BblSourceReader;
  parser: MockProxy<CompetitionStandingsPageParser>;
}): Promise<{
  service: BblCompetitionStandingsReaderService;
  pageParseError: MockProxy<PageParseErrorService>;
}> {
  const pageParseError = mock<PageParseErrorService>();
  pageParseError.build.mockReturnValue(CANNED_PAGE_PARSE_ERROR);
  const moduleRef = await Test.createTestingModule({
    providers: [
      BblCompetitionStandingsReaderService,
      { provide: BblSourceReader, useValue: options.reader },
      { provide: CompetitionStandingsPageParser, useValue: options.parser },
      { provide: PageParseErrorService, useValue: pageParseError },
    ],
  }).compile();
  return {
    service: moduleRef.get(BblCompetitionStandingsReaderService),
    pageParseError,
  };
}

describe('BblCompetitionStandingsReaderService', () => {
  it('keys registered team ids by competition id, deduping repeated s pages', async () => {
    const parser = makeParser({ '69': ['red4', 'äng'] });
    const { service } = await makeService({
      reader: mockBblSourceReader([page({ s: '69' }), page({ s: '69' })]),
      parser,
    });
    const errors: ImportError[] = [];

    const result = await service.getRegisteredTeamIdsByCompetitionId(errors);

    expect(result.get('69')).toEqual(new Set(['red4', 'äng']));
    expect(parser.extractRegisteredTeamIds).toHaveBeenCalledTimes(1);
    expect(errors).toHaveLength(0);
  });

  it('skips a page with no s param', async () => {
    const parser = makeParser({ '69': ['äng'] });
    const { service } = await makeService({
      reader: mockBblSourceReader([page({}), page({ s: '69' })]),
      parser,
    });

    const result = await service.getRegisteredTeamIdsByCompetitionId([]);

    expect([...result.keys()]).toEqual(['69']);
  });

  it('memoizes: a second call does not re-read the source', async () => {
    const reader = mockBblSourceReader([page({ s: '69' })]);
    const pagesSpy = vi.spyOn(reader, 'pages');
    const { service } = await makeService({
      reader,
      parser: makeParser({ '69': ['äng'] }),
    });

    await service.getRegisteredTeamIdsByCompetitionId([]);
    await service.getRegisteredTeamIdsByCompetitionId([]);

    expect(pagesSpy).toHaveBeenCalledTimes(1);
  });

  it('records an error and continues when a page fails to parse', async () => {
    const parser = mock<CompetitionStandingsPageParser>();
    parser.extractRegisteredTeamIds.mockImplementation(() => {
      throw new Error('bad se page');
    });
    const { service, pageParseError } = await makeService({
      reader: mockBblSourceReader([page({ s: '69' })]),
      parser,
    });
    const errors: ImportError[] = [];

    const result = await service.getRegisteredTeamIdsByCompetitionId(errors);

    expect(result.size).toBe(0);
    expect(errors).toEqual([CANNED_PAGE_PARSE_ERROR]);
    expect(pageParseError.build).toHaveBeenCalledWith(
      { s: '69' },
      'standings',
      new Error('bad se page'),
    );
  });

  it('passes a non-Error thrown value straight through to PageParseErrorService', async () => {
    const parser = mock<CompetitionStandingsPageParser>();
    parser.extractRegisteredTeamIds.mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'boom';
    });
    const { service, pageParseError } = await makeService({
      reader: mockBblSourceReader([page({ s: '69' })]),
      parser,
    });
    const errors: ImportError[] = [];

    const result = await service.getRegisteredTeamIdsByCompetitionId(errors);

    expect(result.size).toBe(0);
    expect(errors).toEqual([CANNED_PAGE_PARSE_ERROR]);
    expect(pageParseError.build).toHaveBeenCalledWith(
      { s: '69' },
      'standings',
      'boom',
    );
  });
});
