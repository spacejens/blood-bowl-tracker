import type { ImportError } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

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
  teamsById: Record<string, string[]>,
): MockProxy<CompetitionStandingsPageParser> {
  const parser = mock<CompetitionStandingsPageParser>();
  parser.extractRegisteredTeamIds.mockImplementation(
    (p) => new Set(teamsById[p.params.s] ?? []),
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
  parser: MockProxy<CompetitionStandingsPageParser>;
}): Promise<BblCompetitionStandingsReaderService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      BblCompetitionStandingsReaderService,
      { provide: BblSourceReader, useValue: options.reader },
      { provide: CompetitionStandingsPageParser, useValue: options.parser },
      { provide: PageParseErrorService, useValue: makePageParseError() },
    ],
  }).compile();
  return moduleRef.get(BblCompetitionStandingsReaderService);
}

describe('BblCompetitionStandingsReaderService', () => {
  it('keys registered team ids by competition id, deduping repeated s pages', async () => {
    const parser = makeParser({ '69': ['red4', 'äng'] });
    const service = await makeService({
      reader: makeReader([page({ s: '69' }), page({ s: '69' })]),
      parser,
    });
    const errors: ImportError[] = [];

    const result = await service.getRegisteredTeamIdsByCompetitionId(errors);

    expect(result.get('69')).toEqual(new Set(['red4', 'äng']));
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(parser.extractRegisteredTeamIds).toHaveBeenCalledTimes(1);
    expect(errors).toHaveLength(0);
  });

  it('skips a page with no s param', async () => {
    const parser = makeParser({ '69': ['äng'] });
    const service = await makeService({
      reader: makeReader([page({}), page({ s: '69' })]),
      parser,
    });

    const result = await service.getRegisteredTeamIdsByCompetitionId([]);

    expect([...result.keys()]).toEqual(['69']);
  });

  it('memoizes: a second call does not re-read the source', async () => {
    const reader = makeReader([page({ s: '69' })]);
    const pagesSpy = vi.spyOn(reader, 'pages');
    const service = await makeService({
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
    const service = await makeService({
      reader: makeReader([page({ s: '69' })]),
      parser,
    });
    const errors: ImportError[] = [];

    const result = await service.getRegisteredTeamIdsByCompetitionId(errors);

    expect(result.size).toBe(0);
    expect(
      errors.some((e) => e.message.includes('Failed to parse standings page')),
    ).toBe(true);
  });

  it('handles non-Error throws with String coercion in catch block', async () => {
    const parser = mock<CompetitionStandingsPageParser>();
    parser.extractRegisteredTeamIds.mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'boom';
    });
    const service = await makeService({
      reader: makeReader([page({ s: '69' })]),
      parser,
    });
    const errors: ImportError[] = [];

    const result = await service.getRegisteredTeamIdsByCompetitionId(errors);

    expect(result.size).toBe(0);
    expect(errors.some((e) => e.message.includes('boom'))).toBe(true);
  });
});
