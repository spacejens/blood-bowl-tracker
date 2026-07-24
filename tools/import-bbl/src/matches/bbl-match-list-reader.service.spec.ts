import type { ImportError } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { BblPage } from '../source/bbl-page.types';
import { BblSourceReader } from '../source/bbl-source-reader';
import { PageParseErrorService } from '../source/page-parse-error.service';
import { BblMatchListReaderService } from './bbl-match-list-reader.service';
import type { BblMatch } from './match-list-page-parser';
import { MatchListPageParser } from './match-list-page-parser';

function page(type: string, params: Record<string, string>): BblPage {
  return {
    type,
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

function makeMatchParser(
  matchesById: Record<string, BblMatch[]>,
): MockProxy<MatchListPageParser> {
  const parser = mock<MatchListPageParser>();
  parser.extractMatches.mockImplementation(
    (p) => matchesById[p.params.s] ?? [],
  );
  return parser;
}

function makePageParseError(): MockProxy<PageParseErrorService> {
  const pageParseError = mock<PageParseErrorService>();
  pageParseError.build.mockImplementation(
    (pageParams, pageDescription, error) => ({
      item: { page: pageParams },
      message: `Failed to parse ${pageDescription} page ${JSON.stringify(pageParams)}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    }),
  );
  return pageParseError;
}

async function makeService(options: {
  reader: BblSourceReader;
  parser: MockProxy<MatchListPageParser>;
}): Promise<BblMatchListReaderService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      BblMatchListReaderService,
      { provide: BblSourceReader, useValue: options.reader },
      { provide: MatchListPageParser, useValue: options.parser },
      { provide: PageParseErrorService, useValue: makePageParseError() },
    ],
  }).compile();
  return moduleRef.get(BblMatchListReaderService);
}

const matchOne: BblMatch = {
  bblId: '89',
  date: new Date(Date.UTC(2021, 8, 25)),
};

describe('BblMatchListReaderService', () => {
  it('keys parsed matches by competition id, deduping the ma page by its s param', async () => {
    const parser = makeMatchParser({ '1': [matchOne] });
    const service = await makeService({
      reader: makeReader([
        page('ma', { so: 's', s: '1' }),
        page('ma', { so: 's', s: '1', gr: '' }),
        page('ma', { so: 't', t: 'abc' }),
      ]),
      parser,
    });
    const errors: ImportError[] = [];

    const result = await service.getMatchesByCompetitionId(errors);

    expect(result.get('1')).toEqual([matchOne]);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(parser.extractMatches).toHaveBeenCalledTimes(1);
    expect(errors).toHaveLength(0);
  });

  it('memoizes: a second call does not re-read the source', async () => {
    const reader = makeReader([page('ma', { so: 's', s: '1' })]);
    const pagesSpy = vi.spyOn(reader, 'pages');
    const service = await makeService({
      reader,
      parser: makeMatchParser({ '1': [matchOne] }),
    });
    const errors: ImportError[] = [];

    await service.getMatchesByCompetitionId(errors);
    await service.getMatchesByCompetitionId(errors);

    expect(pagesSpy).toHaveBeenCalledTimes(1);
  });

  it('records an error and continues when a page fails to parse', async () => {
    const parser = mock<MatchListPageParser>();
    parser.extractMatches.mockImplementation(() => {
      throw new Error('bad ma page');
    });
    const service = await makeService({
      reader: makeReader([page('ma', { so: 's', s: '1' })]),
      parser,
    });
    const errors: ImportError[] = [];

    const result = await service.getMatchesByCompetitionId(errors);

    expect(result.size).toBe(0);
    expect(
      errors.some((e) => e.message.includes('Failed to parse match list page')),
    ).toBe(true);
  });

  it('handles non-Error throws with String coercion in catch block', async () => {
    const parser = mock<MatchListPageParser>();
    parser.extractMatches.mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'boom';
    });
    const service = await makeService({
      reader: makeReader([page('ma', { so: 's', s: '1' })]),
      parser,
    });
    const errors: ImportError[] = [];

    const result = await service.getMatchesByCompetitionId(errors);

    expect(result.size).toBe(0);
    expect(errors.some((e) => e.message.includes('boom'))).toBe(true);
  });
});
