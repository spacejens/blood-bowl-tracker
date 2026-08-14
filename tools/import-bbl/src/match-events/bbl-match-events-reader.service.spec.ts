import type { ImportError } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { BblMatchEvents } from '../matches/match-events-page-parser';
import { MatchEventsPageParser } from '../matches/match-events-page-parser';
import { mockBblSourceReader } from '../shared/bbl-source-reader-mock.test-helpers';
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

function makeParser(
  eventsById: Record<string, BblMatchEvents | null>,
): MockProxy<MatchEventsPageParser> {
  const parser = mock<MatchEventsPageParser>();
  parser.extractMatchEvents.mockImplementation(
    (p) => eventsById[p.params.m] ?? null,
  );
  return parser;
}

/**
 * The canned ImportError the mocked PageParseErrorService.build returns.
 * PageParseErrorService's own message template — including the
 * `error instanceof Error ? error.message : String(error)` branch — is covered
 * by ../source/page-parse-error.service.spec.ts. This spec asserts only what
 * BblMatchEventsReaderService hands to build() and that it pushes build()'s
 * return value onto the errors list.
 */
const CANNED_PAGE_PARSE_ERROR: ImportError = {
  item: { page: 'canned' },
  message: 'canned page parse error',
};

async function makeService(options: {
  reader: BblSourceReader;
  parser: MockProxy<MatchEventsPageParser>;
}): Promise<{
  service: BblMatchEventsReaderService;
  pageParseError: MockProxy<PageParseErrorService>;
}> {
  const pageParseError = mock<PageParseErrorService>();
  pageParseError.build.mockReturnValue(CANNED_PAGE_PARSE_ERROR);
  const moduleRef = await Test.createTestingModule({
    providers: [
      BblMatchEventsReaderService,
      { provide: BblSourceReader, useValue: options.reader },
      { provide: MatchEventsPageParser, useValue: options.parser },
      { provide: PageParseErrorService, useValue: pageParseError },
    ],
  }).compile();
  return {
    service: moduleRef.get(BblMatchEventsReaderService),
    pageParseError,
  };
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
    const { service } = await makeService({
      reader: mockBblSourceReader([page({ m: '100' })]),
      parser: makeParser({ '100': eventsOne }),
    });
    const errors: ImportError[] = [];

    const result = await service.getMatchEventsByBblId(errors);

    expect(result.get('100')).toEqual(eventsOne);
    expect(errors).toHaveLength(0);
  });

  it('memoizes: a second call does not re-read the source', async () => {
    const reader = mockBblSourceReader([page({ m: '100' })]);
    const pagesSpy = vi.spyOn(reader, 'pages');
    const { service } = await makeService({
      reader,
      parser: makeParser({ '100': eventsOne }),
    });
    const errors: ImportError[] = [];

    await service.getMatchEventsByBblId(errors);
    await service.getMatchEventsByBblId(errors);

    expect(pagesSpy).toHaveBeenCalledTimes(1);
  });

  it('skips pages the parser returns null for without recording an error', async () => {
    const { service } = await makeService({
      reader: mockBblSourceReader([page({ m: '100' }), page({ m: '101' })]),
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
    const { service, pageParseError } = await makeService({
      reader: mockBblSourceReader([page({ m: '100' })]),
      parser,
    });
    const errors: ImportError[] = [];

    const result = await service.getMatchEventsByBblId(errors);

    expect(result.size).toBe(0);
    expect(errors).toEqual([CANNED_PAGE_PARSE_ERROR]);
    expect(pageParseError.build).toHaveBeenCalledWith(
      { m: '100' },
      'match events',
      new Error('bad m page'),
    );
  });

  it('passes a non-Error thrown value straight through to PageParseErrorService', async () => {
    const parser = mock<MatchEventsPageParser>();
    parser.extractMatchEvents.mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'boom';
    });
    const { service, pageParseError } = await makeService({
      reader: mockBblSourceReader([page({ m: '100' })]),
      parser,
    });
    const errors: ImportError[] = [];

    const result = await service.getMatchEventsByBblId(errors);

    expect(result.size).toBe(0);
    expect(errors).toEqual([CANNED_PAGE_PARSE_ERROR]);
    expect(pageParseError.build).toHaveBeenCalledWith(
      { m: '100' },
      'match events',
      'boom',
    );
  });
});
