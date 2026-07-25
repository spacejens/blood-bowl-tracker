import type { ImportError } from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { BblPage } from '../source/bbl-page.types';
import { BblSourceReader } from '../source/bbl-source-reader';
import { PageParseErrorService } from '../source/page-parse-error.service';
import { BblMatchDetailReaderService } from './bbl-match-detail-reader.service';
import type { BblMatchDetails } from './match-teams-page-parser';
import { MatchTeamsPageParser } from './match-teams-page-parser';

function page(params: Record<string, string>): BblPage {
  return {
    type: 'm',
    params,
    load: () => {
      throw new Error('load() should not be called in this test');
    },
  };
}

function makeReader(pages: BblPage[]): BblSourceReader {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    async *pages() {
      for (const p of pages) {
        yield p;
      }
    },
  } as unknown as BblSourceReader;
}

function makeParser(
  teamsById: Record<string, BblMatchDetails | null>,
): MockProxy<MatchTeamsPageParser> {
  const parser = mock<MatchTeamsPageParser>();
  parser.extractMatchTeams.mockImplementation(
    (p) => teamsById[p.params.m] ?? null,
  );
  return parser;
}

// `error` is a pure identity field copy with no branching or formatting, so
// there is no algorithm here that can drift out of sync with the real
// ImportResultService — exempt from the canned-response rule.
function makeImportResults(): MockProxy<ImportResultService> {
  const importResults = mock<ImportResultService>();
  importResults.error.mockImplementation((args) => ({
    item: args.item,
    message: args.message,
  }));
  return importResults;
}

/**
 * The canned ImportError the mocked PageParseErrorService.build returns.
 * PageParseErrorService's own message template — including the
 * `error instanceof Error ? error.message : String(error)` branch — is covered
 * by ../source/page-parse-error.service.spec.ts. This spec asserts only what
 * BblMatchDetailReaderService hands to build() and that it pushes build()'s
 * return value onto the errors list.
 */
const CANNED_PAGE_PARSE_ERROR: ImportError = {
  item: { page: 'canned' },
  message: 'canned page parse error',
};

async function makeService(options: {
  reader: BblSourceReader;
  parser: MockProxy<MatchTeamsPageParser>;
}): Promise<{
  service: BblMatchDetailReaderService;
  pageParseError: MockProxy<PageParseErrorService>;
}> {
  const pageParseError = mock<PageParseErrorService>();
  pageParseError.build.mockReturnValue(CANNED_PAGE_PARSE_ERROR);
  const moduleRef = await Test.createTestingModule({
    providers: [
      BblMatchDetailReaderService,
      { provide: BblSourceReader, useValue: options.reader },
      { provide: MatchTeamsPageParser, useValue: options.parser },
      { provide: ImportResultService, useValue: makeImportResults() },
      { provide: PageParseErrorService, useValue: pageParseError },
    ],
  }).compile();
  return {
    service: moduleRef.get(BblMatchDetailReaderService),
    pageParseError,
  };
}

const teamsOne: BblMatchDetails = {
  bblId: '100',
  homeTeamId: 'vor',
  awayTeamId: 'sti',
  name: 'Final',
};

describe('BblMatchDetailReaderService', () => {
  it('keys parsed match teams by bblId in a single pass', async () => {
    const parser = makeParser({ '100': teamsOne });
    const { service } = await makeService({
      reader: makeReader([page({ m: '100' })]),
      parser,
    });
    const errors: ImportError[] = [];

    const result = await service.getMatchTeamsByBblId(errors);

    expect(result.get('100')).toEqual(teamsOne);
    expect(errors).toHaveLength(0);
  });

  it('memoizes: a second call does not re-read the source', async () => {
    const reader = makeReader([page({ m: '100' })]);
    const pagesSpy = vi.spyOn(reader, 'pages');
    const { service } = await makeService({
      reader,
      parser: makeParser({ '100': teamsOne }),
    });
    const errors: ImportError[] = [];

    await service.getMatchTeamsByBblId(errors);
    await service.getMatchTeamsByBblId(errors);

    expect(pagesSpy).toHaveBeenCalledTimes(1);
  });

  it('records an error and skips a page the parser returns null for', async () => {
    const { service } = await makeService({
      reader: makeReader([page({ m: '100' }), page({ m: '101' })]),
      parser: makeParser({ '100': teamsOne, '101': null }),
    });
    const errors: ImportError[] = [];

    const result = await service.getMatchTeamsByBblId(errors);

    expect(result.size).toBe(1);
    expect(result.get('100')).toEqual(teamsOne);
    expect(
      errors.some((e) =>
        e.message.includes('Failed to parse match detail page'),
      ),
    ).toBe(true);
  });

  it('records an error and continues when a page throws', async () => {
    const parser = mock<MatchTeamsPageParser>();
    parser.extractMatchTeams.mockImplementation(() => {
      throw new Error('bad m page');
    });
    const { service, pageParseError } = await makeService({
      reader: makeReader([page({ m: '100' })]),
      parser,
    });
    const errors: ImportError[] = [];

    const result = await service.getMatchTeamsByBblId(errors);

    expect(result.size).toBe(0);
    expect(errors).toEqual([CANNED_PAGE_PARSE_ERROR]);
    expect(pageParseError.build).toHaveBeenCalledWith(
      { m: '100' },
      'match detail',
      new Error('bad m page'),
    );
  });

  it('passes a non-Error thrown value straight through to PageParseErrorService', async () => {
    const parser = mock<MatchTeamsPageParser>();
    parser.extractMatchTeams.mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'boom';
    });
    const { service, pageParseError } = await makeService({
      reader: makeReader([page({ m: '100' })]),
      parser,
    });
    const errors: ImportError[] = [];

    const result = await service.getMatchTeamsByBblId(errors);

    expect(result.size).toBe(0);
    expect(errors).toEqual([CANNED_PAGE_PARSE_ERROR]);
    expect(pageParseError.build).toHaveBeenCalledWith(
      { m: '100' },
      'match detail',
      'boom',
    );
  });
});
