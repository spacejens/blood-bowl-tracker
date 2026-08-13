import type {
  ImportError,
  ImportResult,
  MatchDateRange,
} from '@blood-bowl-tracker/import';
import {
  CompetitionsImportService,
  ExternalSystemBootstrapService,
  ImportResultService,
  MatchDateRangeService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { type EraConfig, EraConfigService } from '../eras/era-config.service';
import { BblMatchListReaderService } from '../matches/bbl-match-list-reader.service';
import type { BblMatch } from '../matches/match-list-page-parser';
import type { BblPage } from '../source/bbl-page.types';
import { BblSourceReader } from '../source/bbl-source-reader';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { PageParseErrorService } from '../source/page-parse-error.service';
import { BblCompetitionsImportService } from './bbl-competitions-import.service';
import { CompetitionListPageParser } from './competition-list-page-parser';

/**
 * The canned ImportResult the mocked ImportResultService.result returns.
 * ImportResultService's own `success: errors.length === 0` derivation is
 * covered by packages/import/src/import-result.service.spec.ts; this spec
 * asserts what the service under test *passes to* result() (via
 * `resultArgs()`) and that it returns result()'s value unchanged. The
 * deliberately impossible field values make any leftover assertion that reads
 * the returned object instead of the recorded call arguments fail loudly.
 */
const CANNED_RESULT: ImportResult = {
  success: false,
  imported: -1,
  errors: [{ item: { canned: true }, message: 'canned import result' }],
};

/** The `{ imported, errors }` the service under test handed to ImportResultService.result. */
function resultArgs(importResults: MockProxy<ImportResultService>): {
  imported: number;
  errors: ImportError[];
} {
  return importResults.result.mock.calls[0][0];
}

/**
 * The canned ImportError the mocked PageParseErrorService.build returns.
 * PageParseErrorService's own message template — including the
 * `error instanceof Error ? error.message : String(error)` branch — is
 * covered by ../source/page-parse-error.service.spec.ts. This spec asserts
 * only what BblCompetitionsImportService hands to build() and that it pushes
 * build()'s return value onto the errors list.
 */
const CANNED_PAGE_PARSE_ERROR: ImportError = {
  item: { page: 'canned' },
  message: 'canned page parse error',
};

const erasConfig: EraConfig[] = [
  {
    identity: { name: 'Living rulebook', rulesSets: ['Living rulebook'] },
    dates: {
      startDate: '2011-09-09',
      endDate: '2021-09-01',
      autoAssignByDate: true,
    },
    players: { firstPlayerId: 1, autoAssignByPlayerId: true },
  },
  {
    identity: { name: 'BB2020', rulesSets: ['BB2020'] },
    dates: { startDate: '2021-09-01', autoAssignByDate: true },
    players: { firstPlayerId: 5001, autoAssignByPlayerId: true },
  },
];

const eraIdsByName = new Map<string, number>([
  ['Living rulebook', 100],
  ['BB2020', 200],
]);

/**
 * The canned range the mocked MatchDateRangeService returns by default:
 * an 11-day span (=> season) inside the "Living rulebook" era. The real
 * min/max/span arithmetic is covered by
 * packages/import/src/match-date-range.service.spec.ts; each test here stubs
 * the exact range it expects and asserts what the service does with it.
 */
const CANNED_RANGE: MatchDateRange = {
  earliestDate: new Date(Date.UTC(2011, 11, 7)),
  latestDate: new Date(Date.UTC(2011, 11, 18)),
  spanDays: 11,
};

/** A fake page carrying only params; its load() must never be called (parser is mocked). */
function page(type: string, params: Record<string, string>): BblPage {
  return {
    type,
    params,
    load: () => {
      throw new Error('load() should not be called in this test');
    },
  };
}

/** A source reader whose pages(type) yields the pre-canned pages for that type. */
function makeReader(pagesByType: Record<string, BblPage[]>): BblSourceReader {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    async *pages(type: string) {
      for (const p of pagesByType[type] ?? []) {
        yield p;
      }
    },
  } as unknown as BblSourceReader;
}

/** date-only fixtures turned into per-competition BblMatch arrays for the reader mock. */
function matchesByCompetition(
  datesById: Record<string, Date[]>,
): Map<string, BblMatch[]> {
  return new Map(
    Object.entries(datesById).map(([id, dates]) => [
      id,
      dates.map((date, i) => ({ bblId: `${id}-${i}`, date })),
    ]),
  );
}

interface Mocks {
  listParser: MockProxy<CompetitionListPageParser>;
  matchListReader: MockProxy<BblMatchListReaderService>;
  competitionsImport: MockProxy<CompetitionsImportService>;
  bootstrap: MockProxy<ExternalSystemBootstrapService>;
  eraConfig: MockProxy<EraConfigService>;
  importResults: MockProxy<ImportResultService>;
  pageParseError: MockProxy<PageParseErrorService>;
  dateRange: MockProxy<MatchDateRangeService>;
}

/**
 * Builds the service under test through a TestingModule with every
 * collaborator mocked. ImportResultService.result and
 * PageParseErrorService.build return canned values (see the constants above);
 * tests assert what this service passes to them, not what they compute.
 */
async function makeService(
  reader: BblSourceReader,
): Promise<{ service: BblCompetitionsImportService; mocks: Mocks }> {
  const listParser = mock<CompetitionListPageParser>();

  const matchListReader = mock<BblMatchListReaderService>();
  matchListReader.getMatchesByCompetitionId.mockResolvedValue(new Map());

  const competitionsImport = mock<CompetitionsImportService>();

  const bootstrap = mock<ExternalSystemBootstrapService>();
  bootstrap.bootstrap.mockResolvedValue({ ok: true, ids: [1] });

  const eraConfig = mock<EraConfigService>();
  eraConfig.getEras.mockReturnValue(erasConfig);

  const nameConfig = mock<ExternalSystemNameConfigService>();
  nameConfig.getBblSystemName.mockReturnValue('BBL');

  const importResults = mock<ImportResultService>();
  // `error` is a pure identity field copy with no branching or formatting, so
  // there is no algorithm here that can drift out of sync with the real
  // ImportResultService — exempt from the canned-response rule.
  importResults.error.mockImplementation((args) => ({
    item: args.item,
    message: args.message,
  }));
  importResults.result.mockReturnValue(CANNED_RESULT);

  const pageParseError = mock<PageParseErrorService>();
  pageParseError.build.mockReturnValue(CANNED_PAGE_PARSE_ERROR);

  const dateRange = mock<MatchDateRangeService>();
  dateRange.computeRange.mockReturnValue(CANNED_RANGE);

  const moduleRef = await Test.createTestingModule({
    providers: [
      BblCompetitionsImportService,
      { provide: BblSourceReader, useValue: reader },
      { provide: CompetitionListPageParser, useValue: listParser },
      { provide: BblMatchListReaderService, useValue: matchListReader },
      { provide: CompetitionsImportService, useValue: competitionsImport },
      { provide: ExternalSystemBootstrapService, useValue: bootstrap },
      { provide: EraConfigService, useValue: eraConfig },
      { provide: ExternalSystemNameConfigService, useValue: nameConfig },
      { provide: ImportResultService, useValue: importResults },
      { provide: PageParseErrorService, useValue: pageParseError },
      { provide: MatchDateRangeService, useValue: dateRange },
    ],
  }).compile();

  return {
    service: moduleRef.get(BblCompetitionsImportService),
    mocks: {
      listParser,
      matchListReader,
      competitionsImport,
      bootstrap,
      eraConfig,
      importResults,
      pageParseError,
      dateRange,
    },
  };
}

describe('BblCompetitionsImportService', () => {
  it('populates startDate and endDate from the match-date range', async () => {
    const { service, mocks } = await makeService(
      makeReader({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '1', name: 'Major Season 1' },
    ]);
    const dates = [
      new Date(Date.UTC(2011, 11, 7)),
      new Date(Date.UTC(2011, 11, 18)),
    ];
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      matchesByCompetition({ '1': dates }),
    );
    mocks.competitionsImport.upsertCompetitionResult.mockResolvedValue({
      id: 42,
    });

    await service.importCompetitions(eraIdsByName);

    expect(mocks.dateRange.computeRange).toHaveBeenCalledWith(dates);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: '2011-12-07',
        endDate: '2011-12-18',
      }),
      expect.any(Array),
    );
  });

  it("derives an overridden competition's dates from its matches, not from dateOverrides", async () => {
    const { service, mocks } = await makeService(
      makeReader({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '30', name: 'Chaos Cup' },
    ]);
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      matchesByCompetition({
        '30': [new Date(Date.UTC(2013, 4, 4)), new Date(Date.UTC(2013, 4, 5))],
      }),
    );
    mocks.dateRange.computeRange.mockReturnValue({
      earliestDate: new Date(Date.UTC(2013, 4, 4)),
      latestDate: new Date(Date.UTC(2013, 4, 5)),
      spanDays: 1,
    });
    mocks.competitionsImport.upsertCompetitionResult.mockResolvedValue({
      id: 30,
    });
    mocks.eraConfig.getEras.mockReturnValue([
      {
        identity: { name: 'Living rulebook', rulesSets: ['Living rulebook'] },
        dates: {
          startDate: '2011-09-09',
          endDate: '2021-09-01',
          autoAssignByDate: true,
        },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
        competitions: {
          cupCompetitionIdOverrides: ['30'],
          // Present but must be ignored: the competition has real matches.
          dateOverrides: { '30': { startDate: '1999-01-01' } },
        },
      },
    ]);

    await service.importCompetitions(eraIdsByName);

    expect(resultArgs(mocks.importResults).errors).toHaveLength(0);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'cup',
        eraId: 100,
        startDate: '2013-05-04',
        endDate: '2013-05-05',
      }),
      expect.any(Array),
    );
  });

  it('uses the configured dateOverrides entry for an overridden competition with no matches', async () => {
    const { service, mocks } = await makeService(
      makeReader({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '74', name: 'Minor Season 25' },
    ]);
    mocks.competitionsImport.upsertCompetitionResult.mockResolvedValue({
      id: 74,
    });
    mocks.eraConfig.getEras.mockReturnValue([
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 5001, autoAssignByPlayerId: true },
        competitions: {
          seasonCompetitionIdOverrides: ['74'],
          dateOverrides: {
            '74': { startDate: '2023-07-01', endDate: '2023-12-31' },
          },
        },
      },
    ]);

    await service.importCompetitions(eraIdsByName);

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(1);
    expect(errors).toHaveLength(0);
    expect(mocks.dateRange.computeRange).not.toHaveBeenCalled();
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).toHaveBeenCalledWith(
      {
        name: 'Minor Season 25',
        type: 'season',
        eraId: 200,
        startDate: '2023-07-01',
        endDate: '2023-12-31',
        teamEraIds: [],
        externalIds: [{ externalSystemId: 1, externalId: '74' }],
      },
      expect.any(Array),
    );
  });

  it('omits endDate when the dateOverrides entry has no endDate', async () => {
    const { service, mocks } = await makeService(
      makeReader({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '74', name: 'Minor Season 25' },
    ]);
    mocks.competitionsImport.upsertCompetitionResult.mockResolvedValue({
      id: 74,
    });
    mocks.eraConfig.getEras.mockReturnValue([
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 5001, autoAssignByPlayerId: true },
        competitions: {
          seasonCompetitionIdOverrides: ['74'],
          dateOverrides: { '74': { startDate: '2023-07-01' } },
        },
      },
    ]);

    await service.importCompetitions(eraIdsByName);

    const upsertArg =
      mocks.competitionsImport.upsertCompetitionResult.mock.calls[0][0];
    expect(upsertArg.startDate).toBe('2023-07-01');
    expect(upsertArg.endDate).toBeUndefined();
  });

  it('skips an overridden competition with no matches and no dateOverrides entry, recording an error', async () => {
    const { service, mocks } = await makeService(
      makeReader({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '74', name: 'Minor Season 25' },
    ]);
    mocks.eraConfig.getEras.mockReturnValue([
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 5001, autoAssignByPlayerId: true },
        competitions: { seasonCompetitionIdOverrides: ['74'] },
      },
    ]);

    await service.importCompetitions(eraIdsByName);

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).not.toHaveBeenCalled();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Minor Season 25');
    expect(errors[0].message).toContain('dateOverrides');
  });

  it('derives type=season from a >3-day span and resolves the containing era', async () => {
    const { service, mocks } = await makeService(
      makeReader({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '1', name: 'Major Season 1' },
    ]);
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      matchesByCompetition({
        '1': [
          new Date(Date.UTC(2011, 11, 7)),
          new Date(Date.UTC(2011, 11, 18)),
        ],
      }),
    );
    mocks.competitionsImport.upsertCompetitionResult.mockResolvedValue({
      id: 42,
    });

    const { competitionsByBblId, competitionIdsByBblId } =
      await service.importCompetitions(eraIdsByName);

    expect(mocks.bootstrap.bootstrap).toHaveBeenCalledWith([
      { name: 'BBL', category: 'imported_data_source' },
    ]);
    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).toHaveBeenCalledWith(
      {
        name: 'Major Season 1',
        type: 'season',
        eraId: 100,
        startDate: '2011-12-07',
        endDate: '2011-12-18',
        teamEraIds: [],
        externalIds: [{ externalSystemId: 1, externalId: '1' }],
      },
      expect.any(Array),
    );
    expect(competitionsByBblId.get('1')).toEqual({
      name: 'Major Season 1',
      type: 'season',
      eraId: 100,
      startDate: '2011-12-07',
      endDate: '2011-12-18',
      teamEraIds: [],
      externalIds: [{ externalSystemId: 1, externalId: '1' }],
    });
    expect(competitionIdsByBblId.get('1')).toBe(42);
  });

  it('derives type=cup from a <=3-day span', async () => {
    const { service, mocks } = await makeService(
      makeReader({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '5', name: 'Chaos Cup' },
    ]);
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      matchesByCompetition({
        '5': [new Date(Date.UTC(2021, 9, 2)), new Date(Date.UTC(2021, 9, 4))],
      }),
    );
    mocks.dateRange.computeRange.mockReturnValue({
      earliestDate: new Date(Date.UTC(2021, 9, 2)),
      latestDate: new Date(Date.UTC(2021, 9, 4)),
      spanDays: 2,
    });
    mocks.competitionsImport.upsertCompetitionResult.mockResolvedValue({
      id: 7,
    });

    await service.importCompetitions(eraIdsByName);

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Chaos Cup', type: 'cup', eraId: 200 }),
      expect.any(Array),
    );
  });

  it('skips and records an error for a competition with no dated matches', async () => {
    const { service, mocks } = await makeService(
      makeReader({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '9', name: 'In Progress' },
    ]);

    await service.importCompetitions(eraIdsByName);

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).not.toHaveBeenCalled();
    expect(errors.some((e) => e.message.includes('no dated matches'))).toBe(
      true,
    );
  });

  it('skips and records an error when no configured era contains the earliest match date', async () => {
    const { service, mocks } = await makeService(
      makeReader({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '3', name: 'Ancient Season' },
    ]);
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      matchesByCompetition({
        '3': [new Date(Date.UTC(2000, 0, 1)), new Date(Date.UTC(2000, 5, 1))],
      }),
    );
    mocks.dateRange.computeRange.mockReturnValue({
      earliestDate: new Date(Date.UTC(2000, 0, 1)),
      latestDate: new Date(Date.UTC(2000, 5, 1)),
      spanDays: 152,
    });

    await service.importCompetitions(eraIdsByName);

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).not.toHaveBeenCalled();
    expect(errors.some((e) => e.message.includes('no configured era'))).toBe(
      true,
    );
  });

  it('skips and records a distinct error when the matched era has no known database id', async () => {
    const { service, mocks } = await makeService(
      makeReader({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '1', name: 'Major Season 1' },
    ]);
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      matchesByCompetition({
        '1': [
          new Date(Date.UTC(2011, 11, 7)),
          new Date(Date.UTC(2011, 11, 18)),
        ],
      }),
    );
    // "Living rulebook" matches by date, but is absent from eraIdsByName,
    // simulating its rules set having failed to import earlier in the run.

    await service.importCompetitions(new Map());

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).not.toHaveBeenCalled();
    expect(
      errors.some(
        (e) =>
          e.message.includes('"Living rulebook"') &&
          e.message.includes('no known database id'),
      ),
    ).toBe(true);
    expect(errors.some((e) => e.message.includes('no configured era'))).toBe(
      false,
    );
  });

  it('skips and records a distinct error when the override era has no known database id', async () => {
    const { service, mocks } = await makeService(
      makeReader({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '74', name: 'Minor Season 25' },
    ]);
    mocks.eraConfig.getEras.mockReturnValue([
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 5001, autoAssignByPlayerId: true },
        competitions: { seasonCompetitionIdOverrides: ['74'] },
      },
    ]);
    // "BB2020" is matched by seasonCompetitionIdOverrides, but is absent from
    // eraIdsByName, simulating its rules set having failed to import
    // earlier in the run.

    await service.importCompetitions(new Map());

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).not.toHaveBeenCalled();
    expect(
      errors.some(
        (e) =>
          e.message.includes('"BB2020"') &&
          e.message.includes('no known database id'),
      ),
    ).toBe(true);
    expect(errors.some((e) => e.message.includes('no dated matches'))).toBe(
      false,
    );
  });

  it('falls back to an sr page for the master list when no se page exists', async () => {
    const { service, mocks } = await makeService(
      makeReader({ se: [], sr: [page('sr', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '1', name: 'Major Season 1' },
    ]);
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      matchesByCompetition({
        '1': [new Date(Date.UTC(2012, 0, 1)), new Date(Date.UTC(2012, 5, 1))],
      }),
    );
    mocks.dateRange.computeRange.mockReturnValue({
      earliestDate: new Date(Date.UTC(2012, 0, 1)),
      latestDate: new Date(Date.UTC(2012, 5, 1)),
      spanDays: 152,
    });
    mocks.competitionsImport.upsertCompetitionResult.mockResolvedValue({
      id: 1,
    });

    await service.importCompetitions(eraIdsByName);

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(mocks.competitionsImport.upsertCompetitionResult).toHaveBeenCalled();
  });

  it('skips a bare se index page (no s param) and reads the list from the page that has one', async () => {
    // Mirrors the real BBL mirror's bare `default.asp?p=se` index page, which
    // has no `s` param and lacks the master `<option>` dropdown entirely, so
    // extractCompetitions correctly (but unhelpfully) returns [] for it.
    const { service, mocks } = await makeService(
      makeReader({ se: [page('se', {}), page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockImplementation((p) =>
      p.params.s === undefined ? [] : [{ bblId: '1', name: 'Major Season 1' }],
    );
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      matchesByCompetition({
        '1': [new Date(Date.UTC(2012, 0, 1)), new Date(Date.UTC(2012, 5, 1))],
      }),
    );
    mocks.dateRange.computeRange.mockReturnValue({
      earliestDate: new Date(Date.UTC(2012, 0, 1)),
      latestDate: new Date(Date.UTC(2012, 5, 1)),
      spanDays: 152,
    });
    mocks.competitionsImport.upsertCompetitionResult.mockResolvedValue({
      id: 1,
    });

    await service.importCompetitions(eraIdsByName);

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(mocks.competitionsImport.upsertCompetitionResult).toHaveBeenCalled();
  });

  it('records one error and imports nothing when external system bootstrap fails', async () => {
    const { service, mocks } = await makeService(
      makeReader({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '1', name: 'Major Season 1' },
    ]);
    mocks.bootstrap.bootstrap.mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['BBL'] },
        message: 'network timeout',
      },
    });

    await service.importCompetitions(eraIdsByName);

    const { errors } = resultArgs(mocks.importResults);
    expect(errors).toHaveLength(1);
    // Message is passed through unchanged (this caller adds no prefix): the
    // assertion now fails if production stops surfacing the real error text.
    expect(errors[0].message).toBe('network timeout');
    // And the error names the external systems the bootstrap tried to upsert.
    expect(errors[0].item).toEqual({
      externalSystems: ['BBL'],
    });
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).not.toHaveBeenCalled();
  });

  it('records one error naming only the BBL system when the era config cannot be read', async () => {
    const { service, mocks } = await makeService(
      makeReader({ se: [page('se', { s: '66' })] }),
    );
    mocks.eraConfig.getEras.mockImplementation(() => {
      throw new Error('era config is malformed');
    });

    const { competitionsByBblId, competitionIdsByBblId } =
      await service.importCompetitions(eraIdsByName);

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('era config is malformed');
    expect(errors[0].item).toEqual({ externalSystems: ['BBL'] });
    expect(mocks.bootstrap.bootstrap).not.toHaveBeenCalled();
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).not.toHaveBeenCalled();
    expect(competitionsByBblId.size).toBe(0);
    expect(competitionIdsByBblId.size).toBe(0);
  });

  it('records an error and reports zero imports when the master list page fails to parse', async () => {
    const { service, mocks } = await makeService(
      makeReader({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockImplementation(() => {
      throw new Error('bad se page');
    });

    await service.importCompetitions(eraIdsByName);

    // readCompetitionList returns null on a parse failure, and the caller
    // treats a null result the same as "no se or sr page was found" — so a
    // parse failure records *two* errors: the page-parse error itself, and
    // the caller's fallback "no se or sr page" error.
    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).not.toHaveBeenCalled();
    expect(errors).toContainEqual(CANNED_PAGE_PARSE_ERROR);
    expect(mocks.pageParseError.build).toHaveBeenCalledWith(
      { s: '66' },
      'master competition list',
      new Error('bad se page'),
    );
    expect(errors.some((e) => e.message.includes('no se or sr page'))).toBe(
      true,
    );
  });

  it('imports a zero-match competition via its era override as type season', async () => {
    const { service, mocks } = await makeService(
      makeReader({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '74', name: 'Minor Season 25' },
    ]);
    mocks.competitionsImport.upsertCompetitionResult.mockResolvedValue({
      id: 74,
    });
    mocks.eraConfig.getEras.mockReturnValue([
      {
        identity: { name: 'Living rulebook', rulesSets: ['Living rulebook'] },
        dates: {
          startDate: '2011-09-09',
          endDate: '2021-09-01',
          autoAssignByDate: true,
        },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
      },
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 5001, autoAssignByPlayerId: true },
        competitions: {
          seasonCompetitionIdOverrides: ['74'],
          dateOverrides: {
            '74': { startDate: '2023-07-01', endDate: '2023-12-31' },
          },
        },
      },
    ]);

    const { competitionsByBblId, competitionIdsByBblId } =
      await service.importCompetitions(eraIdsByName);

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(1);
    expect(errors).toHaveLength(0);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).toHaveBeenCalledWith(
      {
        name: 'Minor Season 25',
        type: 'season',
        eraId: 200,
        startDate: '2023-07-01',
        endDate: '2023-12-31',
        teamEraIds: [],
        externalIds: [{ externalSystemId: 1, externalId: '74' }],
      },
      expect.any(Array),
    );
    expect(competitionsByBblId.get('74')?.eraId).toBe(200);
    expect(competitionIdsByBblId.get('74')).toBe(74);
  });

  it('applies an era override ahead of match-date resolution even when the competition has matches', async () => {
    const { service, mocks } = await makeService(
      makeReader({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '74', name: 'Minor Season 25' },
    ]);
    // Dates fall in the "Living rulebook" range and span 1 day (would be a
    // cup); the override must still pin BB2020 (era 200) and type season.
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      matchesByCompetition({
        '74': [new Date(Date.UTC(2012, 0, 1)), new Date(Date.UTC(2012, 0, 2))],
      }),
    );
    mocks.dateRange.computeRange.mockReturnValue({
      earliestDate: new Date(Date.UTC(2012, 0, 1)),
      latestDate: new Date(Date.UTC(2012, 0, 2)),
      spanDays: 1,
    });
    mocks.competitionsImport.upsertCompetitionResult.mockResolvedValue({
      id: 74,
    });
    mocks.eraConfig.getEras.mockReturnValue([
      {
        identity: { name: 'Living rulebook', rulesSets: ['Living rulebook'] },
        dates: {
          startDate: '2011-09-09',
          endDate: '2021-09-01',
          autoAssignByDate: true,
        },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
      },
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 5001, autoAssignByPlayerId: true },
        competitions: { seasonCompetitionIdOverrides: ['74'] },
      },
    ]);

    await service.importCompetitions(eraIdsByName);

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'season', eraId: 200 }),
      expect.any(Array),
    );
  });

  it('applies cupCompetitionIdOverrides forcing type cup even when the span would compute season', async () => {
    const { service, mocks } = await makeService(
      makeReader({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '33', name: 'Stunty Leeg 2' },
    ]);
    // 6-day span -> would compute 'season' under CUP_MAX_SPAN_DAYS; the cup
    // override must force 'cup' and pin the Living rulebook era (100).
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      matchesByCompetition({
        '33': [
          new Date(Date.UTC(2016, 10, 19)),
          new Date(Date.UTC(2016, 10, 25)),
        ],
      }),
    );
    mocks.dateRange.computeRange.mockReturnValue({
      earliestDate: new Date(Date.UTC(2016, 10, 19)),
      latestDate: new Date(Date.UTC(2016, 10, 25)),
      spanDays: 6,
    });
    mocks.competitionsImport.upsertCompetitionResult.mockResolvedValue({
      id: 33,
    });
    mocks.eraConfig.getEras.mockReturnValue([
      {
        identity: { name: 'Living rulebook', rulesSets: ['Living rulebook'] },
        dates: {
          startDate: '2011-09-09',
          endDate: '2021-09-01',
          autoAssignByDate: true,
        },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
        competitions: { cupCompetitionIdOverrides: ['33'] },
      },
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 5001, autoAssignByPlayerId: true },
      },
    ]);

    await service.importCompetitions(eraIdsByName);

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Stunty Leeg 2',
        type: 'cup',
        eraId: 100,
      }),
      expect.any(Array),
    );
  });

  it('resolves a competition override regardless of overlapping era date-range order', async () => {
    // Two eras whose date ranges overlap; the override era is listed SECOND but
    // must still win, proving override resolution is independent of array order
    // and of natural date-range matching.
    const { service, mocks } = await makeService(
      makeReader({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '30', name: 'Stunty Leeg 1' },
    ]);
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      matchesByCompetition({ '30': [new Date(Date.UTC(2016, 2, 12))] }),
    );
    mocks.dateRange.computeRange.mockReturnValue({
      earliestDate: new Date(Date.UTC(2016, 2, 12)),
      latestDate: new Date(Date.UTC(2016, 2, 12)),
      spanDays: 0,
    });
    mocks.competitionsImport.upsertCompetitionResult.mockResolvedValue({
      id: 30,
    });
    mocks.eraConfig.getEras.mockReturnValue([
      {
        identity: { name: 'Living rulebook', rulesSets: ['Living rulebook'] },
        dates: {
          startDate: '2011-09-09',
          endDate: '2021-09-01',
          autoAssignByDate: true,
        },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
      },
      {
        identity: { name: 'Stunty', rulesSets: ['Living rulebook'] },
        dates: {
          startDate: '2011-09-09',
          endDate: '2021-09-01',
          autoAssignByDate: true,
        },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
        competitions: { cupCompetitionIdOverrides: ['30'] },
      },
    ]);

    const overlapEraIds = new Map<string, number>([
      ['Living rulebook', 100],
      ['Stunty', 300],
    ]);
    await service.importCompetitions(overlapEraIds);

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Stunty Leeg 1',
        type: 'cup',
        eraId: 300,
      }),
      expect.any(Array),
    );
  });

  it('excludes an autoAssignByDate:false era from date resolution but still honors its competition override', async () => {
    // One override-only era (autoAssignByDate:false) whose date range would,
    // if scanned, capture the dated competition below — proving the scan skips
    // it. Its own override-listed competition still resolves to it.
    const overrideOnlyEras: EraConfig[] = [
      {
        identity: { name: 'Main', rulesSets: ['BB2020'] },
        dates: {
          startDate: '2016-01-01',
          endDate: '2017-01-01',
          autoAssignByDate: true,
        },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
      },
      {
        identity: { name: 'Side', rulesSets: ['CRP'] },
        dates: {
          startDate: '2016-01-01',
          endDate: '2017-01-01',
          autoAssignByDate: false,
        },
        players: { autoAssignByPlayerId: false },
        competitions: { cupCompetitionIdOverrides: ['30'] },
      },
    ];
    const eraIds = new Map<string, number>([
      ['Main', 100],
      ['Side', 200],
    ]);
    const { service, mocks } = await makeService(
      makeReader({ se: [page('se', { s: '66' })] }),
    );
    mocks.eraConfig.getEras.mockReturnValue(overrideOnlyEras);
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '1', name: 'Dated Season' },
      { bblId: '30', name: 'Side Cup' },
    ]);
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      matchesByCompetition({
        '1': [new Date('2016-06-01'), new Date('2016-08-01')],
        '30': [new Date('2016-06-15')],
      }),
    );
    mocks.dateRange.computeRange
      .mockReturnValueOnce({
        earliestDate: new Date('2016-06-01'),
        latestDate: new Date('2016-08-01'),
        spanDays: 61,
      })
      .mockReturnValueOnce({
        earliestDate: new Date('2016-06-15'),
        latestDate: new Date('2016-06-15'),
        spanDays: 0,
      });
    mocks.competitionsImport.upsertCompetitionResult
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce({ id: 30 });

    const { competitionsByBblId } = await service.importCompetitions(eraIds);

    // The plain dated competition lands in Main (the only auto-assign era).
    expect(competitionsByBblId.get('1')?.eraId).toBe(100);
    // The override-listed competition lands in Side despite its date.
    expect(competitionsByBblId.get('30')?.eraId).toBe(200);
    expect(competitionsByBblId.get('30')?.type).toBe('cup');
  });

  it('resolves a competition to an override era from a second league', async () => {
    const erasWithGbbl: EraConfig[] = [
      ...erasConfig,
      {
        leagueName: 'GBBL',
        identity: { name: 'GBBL 1', rulesSets: ['BB2016'] },
        dates: {
          startDate: '2019-08-03',
          endDate: '2019-11-13',
          autoAssignByDate: false,
        },
        players: { autoAssignByPlayerId: false },
        competitions: { seasonCompetitionIdOverrides: ['55'] },
        teams: { teamCodeOverrides: ['fes2'] },
      },
    ];
    const eraIds = new Map<string, number>([...eraIdsByName, ['GBBL 1', 900]]);

    const { service, mocks } = await makeService(
      makeReader({ se: [page('se', { s: '55' })] }),
    );
    mocks.eraConfig.getEras.mockReturnValue(erasWithGbbl);
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '55', name: 'GBBL 1' },
    ]);
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      matchesByCompetition({ '55': [new Date('2019-08-03')] }),
    );
    mocks.dateRange.computeRange.mockReturnValue({
      earliestDate: new Date('2019-08-03'),
      latestDate: new Date('2019-08-03'),
      spanDays: 0,
    });
    mocks.competitionsImport.upsertCompetitionResult.mockResolvedValue({
      id: 1,
    });

    await service.importCompetitions(eraIds);

    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ eraId: 900, type: 'season' }),
      expect.anything(),
    );
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const { service, mocks } = await makeService(
      makeReader({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([]);

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result).toBe(CANNED_RESULT);
  });
});
