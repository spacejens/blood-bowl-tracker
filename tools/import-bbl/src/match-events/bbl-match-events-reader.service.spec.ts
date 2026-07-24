import type { ImportError } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { BblMatchEvents } from '../matches/match-events-page-parser';
import { MatchEventsPageParser } from '../matches/match-events-page-parser';
import type { BblPage } from '../source/bbl-page.types';
import { BblSourceReader } from '../source/bbl-source-reader';
import { PageParseErrorService } from '../source/page-parse-error.service';
import { BblMatchEventsReaderService } from './bbl-match-events-reader.service';

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
  eventsById: Record<string, BblMatchEvents | null>,
): MockProxy<MatchEventsPageParser> {
  const parser = mock<MatchEventsPageParser>();
  parser.extractMatchEvents.mockImplementation(
    (p) => eventsById[p.params.m] ?? null,
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
  parser: MockProxy<MatchEventsPageParser>;
}): Promise<BblMatchEventsReaderService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      BblMatchEventsReaderService,
      { provide: BblSourceReader, useValue: options.reader },
      { provide: MatchEventsPageParser, useValue: options.parser },
      { provide: PageParseErrorService, useValue: makePageParseError() },
    ],
  }).compile();
  return moduleRef.get(BblMatchEventsReaderService);
}

const eventsOne: BblMatchEvents = {
  bblId: '100',
  homeTeamId: 'vor',
  awayTeamId: 'sti',
  actions: [],
  consequences: [],
};

describe('BblMatchEventsReaderService', () => {
  it('keys parsed match events by bblId in a single pass', async () => {
    const service = await makeService({
      reader: makeReader([page({ m: '100' })]),
      parser: makeParser({ '100': eventsOne }),
    });
    const errors: ImportError[] = [];

    const result = await service.getMatchEventsByBblId(errors);

    expect(result.get('100')).toEqual(eventsOne);
    expect(errors).toHaveLength(0);
  });

  it('memoizes: a second call does not re-read the source', async () => {
    const reader = makeReader([page({ m: '100' })]);
    const pagesSpy = vi.spyOn(reader, 'pages');
    const service = await makeService({
      reader,
      parser: makeParser({ '100': eventsOne }),
    });
    const errors: ImportError[] = [];

    await service.getMatchEventsByBblId(errors);
    await service.getMatchEventsByBblId(errors);

    expect(pagesSpy).toHaveBeenCalledTimes(1);
  });

  it('skips pages the parser returns null for without recording an error', async () => {
    const service = await makeService({
      reader: makeReader([page({ m: '100' }), page({ m: '101' })]),
      parser: makeParser({ '100': eventsOne, '101': null }),
    });
    const errors: ImportError[] = [];

    const result = await service.getMatchEventsByBblId(errors);

    expect(result.size).toBe(1);
    expect(result.get('100')).toEqual(eventsOne);
    expect(errors).toHaveLength(0);
  });

  it('records an error and continues when a page throws', async () => {
    const parser = mock<MatchEventsPageParser>();
    parser.extractMatchEvents.mockImplementation(() => {
      throw new Error('bad m page');
    });
    const service = await makeService({
      reader: makeReader([page({ m: '100' })]),
      parser,
    });
    const errors: ImportError[] = [];

    const result = await service.getMatchEventsByBblId(errors);

    expect(result.size).toBe(0);
    expect(errors.some((e) => e.message.includes('bad m page'))).toBe(true);
  });

  it('handles non-Error throws with String coercion in catch block', async () => {
    const parser = mock<MatchEventsPageParser>();
    parser.extractMatchEvents.mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'boom';
    });
    const service = await makeService({
      reader: makeReader([page({ m: '100' })]),
      parser,
    });
    const errors: ImportError[] = [];

    const result = await service.getMatchEventsByBblId(errors);

    expect(result.size).toBe(0);
    expect(errors.some((e) => e.message.includes('boom'))).toBe(true);
  });
});
