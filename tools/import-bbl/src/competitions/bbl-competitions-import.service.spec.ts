import {
  CompetitionsImportService,
  ExternalSystemBootstrapService,
  ImportResultService,
  NameExternalIdService,
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
}

/**
 * Builds the service under test through a TestingModule with every
 * collaborator mocked. Deterministic collaborators (name resolution, error
 * building) mirror the real production logic so a regression in the service
 * under test still fails these tests.
 */
async function makeService(
  reader: BblSourceReader,
): Promise<{ service: BblCompetitionsImportService; mocks: Mocks }> {
  const listParser = mock<CompetitionListPageParser>();

  const matchListReader = mock<BblMatchListReaderService>();
  matchListReader.getMatchesByCompetitionId.mockResolvedValue(new Map());

  const competitionsImport = mock<CompetitionsImportService>();

  const bootstrap = mock<ExternalSystemBootstrapService>();
  bootstrap.bootstrap.mockResolvedValue({ ok: true, ids: [1, 2] });

  const eraConfig = mock<EraConfigService>();
  eraConfig.getEras.mockReturnValue(erasConfig);

  const nameConfig = mock<ExternalSystemNameConfigService>();
  nameConfig.getBblSystemName.mockReturnValue('BBL');

  const nameExternalId = mock<NameExternalIdService>();
  nameExternalId.forCompetition.mockImplementation((name) => name);

  const importResults = mock<ImportResultService>();
  importResults.error.mockImplementation((args) => ({
    item: args.item,
    message: args.message,
  }));
  importResults.result.mockImplementation((args) => ({
    success: args.errors.length === 0,
    imported: args.imported,
    errors: args.errors,
  }));

  const pageParseError = mock<PageParseErrorService>();
  pageParseError.build.mockImplementation(
    (pageParams, pageDescription, error) =>
      importResults.error({
        item: { page: pageParams },
        message: `Failed to parse ${pageDescription} page ${JSON.stringify(pageParams)}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }),
  );

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
      { provide: NameExternalIdService, useValue: nameExternalId },
      { provide: ImportResultService, useValue: importResults },
      { provide: PageParseErrorService, useValue: pageParseError },
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
    },
  };
}

describe('BblCompetitionsImportService', () => {
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

    const { result, competitionsByBblId, competitionIdsByBblId } =
      await service.importCompetitions(eraIdsByName);

    expect(mocks.bootstrap.bootstrap).toHaveBeenCalledWith([
      { name: 'BBL', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
    expect(result.imported).toBe(1);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).toHaveBeenCalledWith(
      {
        name: 'Major Season 1',
        type: 'season',
        eraId: 100,
        teamEraIds: [],
        externalIds: [
          { externalSystemId: 1, externalId: '1' },
          { externalSystemId: 2, externalId: 'Major Season 1' },
        ],
      },
      expect.any(Array),
    );
    expect(competitionsByBblId.get('1')).toEqual({
      name: 'Major Season 1',
      type: 'season',
      eraId: 100,
      teamEraIds: [],
      externalIds: [
        { externalSystemId: 1, externalId: '1' },
        { externalSystemId: 2, externalId: 'Major Season 1' },
      ],
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
    mocks.competitionsImport.upsertCompetitionResult.mockResolvedValue({
      id: 7,
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(1);
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

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(0);
    expect(result.success).toBe(false);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).not.toHaveBeenCalled();
    expect(
      result.errors.some((e) => e.message.includes('no dated matches')),
    ).toBe(true);
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

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(0);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).not.toHaveBeenCalled();
    expect(
      result.errors.some((e) => e.message.includes('no configured era')),
    ).toBe(true);
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

    const { result } = await service.importCompetitions(new Map());

    expect(result.imported).toBe(0);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).not.toHaveBeenCalled();
    expect(
      result.errors.some(
        (e) =>
          e.message.includes('"Living rulebook"') &&
          e.message.includes('no known database id'),
      ),
    ).toBe(true);
    expect(
      result.errors.some((e) => e.message.includes('no configured era')),
    ).toBe(false);
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

    const { result } = await service.importCompetitions(new Map());

    expect(result.imported).toBe(0);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).not.toHaveBeenCalled();
    expect(
      result.errors.some(
        (e) =>
          e.message.includes('"BB2020"') &&
          e.message.includes('no known database id'),
      ),
    ).toBe(true);
    expect(
      result.errors.some((e) => e.message.includes('no dated matches')),
    ).toBe(false);
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
    mocks.competitionsImport.upsertCompetitionResult.mockResolvedValue({
      id: 1,
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(1);
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
    mocks.competitionsImport.upsertCompetitionResult.mockResolvedValue({
      id: 1,
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(1);
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
        item: { externalSystems: ['BBL', 'Name'] },
        message: 'network timeout',
      },
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toBe('network timeout');
    expect(result.errors[0].item).toEqual({
      externalSystems: ['BBL', 'Name'],
    });
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).not.toHaveBeenCalled();
  });

  it('records an error and reports zero imports when the master list page fails to parse', async () => {
    const { service, mocks } = await makeService(
      makeReader({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockImplementation(() => {
      throw new Error('bad se page');
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(0);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).not.toHaveBeenCalled();
    expect(
      result.errors.some((e) =>
        e.message.includes('Failed to parse master competition list page'),
      ),
    ).toBe(true);
    expect(
      result.errors.some((e) => e.message.includes('no se or sr page')),
    ).toBe(true);
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
        competitions: { seasonCompetitionIdOverrides: ['74'] },
      },
    ]);

    const { result, competitionsByBblId, competitionIdsByBblId } =
      await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).toHaveBeenCalledWith(
      {
        name: 'Minor Season 25',
        type: 'season',
        eraId: 200,
        teamEraIds: [],
        externalIds: [
          { externalSystemId: 1, externalId: '74' },
          { externalSystemId: 2, externalId: 'Minor Season 25' },
        ],
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

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(1);
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

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(1);
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
    const { result } = await service.importCompetitions(overlapEraIds);

    expect(result.imported).toBe(1);
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
});
