import type {
  CompetitionsImportService,
  ExternalSystemBootstrapService,
} from '@blood-bowl-tracker/import';
import { NameExternalIdService } from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { EraConfig, EraConfigService } from '../eras/era-config.service';
import type { BblMatchListReaderService } from '../matches/bbl-match-list-reader.service';
import type { BblMatch } from '../matches/match-list-page-parser';
import type { BblPage } from '../source/bbl-page.types';
import type { BblSourceReader } from '../source/bbl-source-reader';
import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
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

/** A fake page carrying only params; its load() must never be called (parsers are spied). */
import { NormalizeExtractedTextService } from '../source/normalize-extracted-text.service';

const normalizeText = new NormalizeExtractedTextService();

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

/** A competition-list parser that returns the given list from any se/sr page. */
function makeListParser(list: { bblId: string; name: string }[]) {
  const parser = new CompetitionListPageParser(normalizeText);
  vi.spyOn(parser, 'extractCompetitions').mockReturnValue(list);
  return parser;
}

/** A fake match-list reader mapping a competition id to a pre-canned date list. */
function makeMatchListReader(datesById: Record<string, Date[]>) {
  const getMatchesByCompetitionId = vi.fn().mockResolvedValue(
    new Map<string, BblMatch[]>(
      Object.entries(datesById).map(([id, dates]) => [
        id,
        dates.map((date, i) => ({
          bblId: `${id}-${i}`,
          date,
        })),
      ]),
    ),
  );
  return { getMatchesByCompetitionId } as unknown as BblMatchListReaderService;
}

function makeService(opts: {
  reader: BblSourceReader;
  listParser: CompetitionListPageParser;
  matchListReader: BblMatchListReaderService;
  bootstrap: ReturnType<typeof vi.fn>;
  upsertCompetitionResult: ReturnType<typeof vi.fn>;
  getEras?: () => EraConfig[];
}) {
  return new BblCompetitionsImportService(
    opts.reader,
    opts.listParser,
    opts.matchListReader,
    {
      upsertCompetitionResult: opts.upsertCompetitionResult,
    } as unknown as CompetitionsImportService,
    {
      bootstrap: opts.bootstrap,
    } as unknown as ExternalSystemBootstrapService,
    {
      getEras: opts.getEras ?? (() => erasConfig),
    } as unknown as EraConfigService,
    {
      getBblSystemName: () => 'BBL',
    } as unknown as ExternalSystemNameConfigService,
    new NameExternalIdService(),
  );
}

describe('BblCompetitionsImportService', () => {
  it('derives type=season from a >3-day span and resolves the containing era', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertCompetitionResult = vi.fn().mockResolvedValue({ id: 42 });
    const service = makeService({
      reader: makeReader({
        se: [page('se', { s: '66' })],
      }),
      listParser: makeListParser([{ bblId: '1', name: 'Major Season 1' }]),
      matchListReader: makeMatchListReader({
        '1': [
          new Date(Date.UTC(2011, 11, 7)),
          new Date(Date.UTC(2011, 11, 18)),
        ],
      }),
      bootstrap,
      upsertCompetitionResult,
    });

    const { result, competitionsByBblId, competitionIdsByBblId } =
      await service.importCompetitions(eraIdsByName);

    expect(bootstrap).toHaveBeenCalledWith([
      { name: 'BBL', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
    expect(result.imported).toBe(1);
    expect(upsertCompetitionResult).toHaveBeenCalledWith(
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
    const upsertCompetitionResult = vi.fn().mockResolvedValue({ id: 7 });
    const service = makeService({
      reader: makeReader({
        se: [page('se', { s: '66' })],
      }),
      listParser: makeListParser([{ bblId: '5', name: 'Chaos Cup' }]),
      matchListReader: makeMatchListReader({
        '5': [new Date(Date.UTC(2021, 9, 2)), new Date(Date.UTC(2021, 9, 4))],
      }),
      bootstrap: vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] }),
      upsertCompetitionResult,
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(1);
    expect(upsertCompetitionResult).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Chaos Cup', type: 'cup', eraId: 200 }),
      expect.any(Array),
    );
  });

  it('skips and records an error for a competition with no dated matches', async () => {
    const upsertCompetitionResult = vi.fn();
    const service = makeService({
      reader: makeReader({
        se: [page('se', { s: '66' })],
      }),
      listParser: makeListParser([{ bblId: '9', name: 'In Progress' }]),
      matchListReader: makeMatchListReader({}),
      bootstrap: vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] }),
      upsertCompetitionResult,
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(0);
    expect(result.success).toBe(false);
    expect(upsertCompetitionResult).not.toHaveBeenCalled();
    expect(
      result.errors.some((e) => e.message.includes('no dated matches')),
    ).toBe(true);
  });

  it('skips and records an error when no configured era contains the earliest match date', async () => {
    const upsertCompetitionResult = vi.fn();
    const service = makeService({
      reader: makeReader({
        se: [page('se', { s: '66' })],
      }),
      listParser: makeListParser([{ bblId: '3', name: 'Ancient Season' }]),
      matchListReader: makeMatchListReader({
        '3': [new Date(Date.UTC(2000, 0, 1)), new Date(Date.UTC(2000, 5, 1))],
      }),
      bootstrap: vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] }),
      upsertCompetitionResult,
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(0);
    expect(upsertCompetitionResult).not.toHaveBeenCalled();
    expect(
      result.errors.some((e) => e.message.includes('no configured era')),
    ).toBe(true);
  });

  it('skips and records a distinct error when the matched era has no known database id', async () => {
    const upsertCompetitionResult = vi.fn();
    const service = makeService({
      reader: makeReader({
        se: [page('se', { s: '66' })],
      }),
      listParser: makeListParser([{ bblId: '1', name: 'Major Season 1' }]),
      matchListReader: makeMatchListReader({
        '1': [
          new Date(Date.UTC(2011, 11, 7)),
          new Date(Date.UTC(2011, 11, 18)),
        ],
      }),
      bootstrap: vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] }),
      upsertCompetitionResult,
      // "Living rulebook" matches by date, but is absent from eraIdsByName,
      // simulating its rules set having failed to import earlier in the run.
    });

    const { result } = await service.importCompetitions(new Map());

    expect(result.imported).toBe(0);
    expect(upsertCompetitionResult).not.toHaveBeenCalled();
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
    const upsertCompetitionResult = vi.fn();
    const service = makeService({
      reader: makeReader({
        se: [page('se', { s: '66' })],
      }),
      listParser: makeListParser([{ bblId: '74', name: 'Minor Season 25' }]),
      matchListReader: makeMatchListReader({}),
      bootstrap: vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] }),
      upsertCompetitionResult,
      getEras: () => [
        {
          identity: { name: 'BB2020', rulesSets: ['BB2020'] },
          dates: { startDate: '2021-09-01', autoAssignByDate: true },
          players: { firstPlayerId: 5001, autoAssignByPlayerId: true },
          competitions: { seasonCompetitionIdOverrides: ['74'] },
        },
      ],
      // "BB2020" is matched by seasonCompetitionIdOverrides, but is absent from
      // eraIdsByName, simulating its rules set having failed to import
      // earlier in the run.
    });

    const { result } = await service.importCompetitions(new Map());

    expect(result.imported).toBe(0);
    expect(upsertCompetitionResult).not.toHaveBeenCalled();
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
    const upsertCompetitionResult = vi.fn().mockResolvedValue({ id: 1 });
    const service = makeService({
      reader: makeReader({
        se: [],
        sr: [page('sr', { s: '66' })],
      }),
      listParser: makeListParser([{ bblId: '1', name: 'Major Season 1' }]),
      matchListReader: makeMatchListReader({
        '1': [new Date(Date.UTC(2012, 0, 1)), new Date(Date.UTC(2012, 5, 1))],
      }),
      bootstrap: vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] }),
      upsertCompetitionResult,
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(1);
    expect(upsertCompetitionResult).toHaveBeenCalled();
  });

  it('skips a bare se index page (no s param) and reads the list from the page that has one', async () => {
    // Mirrors the real BBL mirror's bare `default.asp?p=se` index page, which
    // has no `s` param and lacks the master `<option>` dropdown entirely, so
    // extractCompetitions correctly (but unhelpfully) returns [] for it.
    const listParser = new CompetitionListPageParser(normalizeText);
    vi.spyOn(listParser, 'extractCompetitions').mockImplementation((p) =>
      p.params.s === undefined ? [] : [{ bblId: '1', name: 'Major Season 1' }],
    );
    const upsertCompetitionResult = vi.fn().mockResolvedValue({ id: 1 });
    const service = makeService({
      reader: makeReader({
        se: [page('se', {}), page('se', { s: '66' })],
      }),
      listParser,
      matchListReader: makeMatchListReader({
        '1': [new Date(Date.UTC(2012, 0, 1)), new Date(Date.UTC(2012, 5, 1))],
      }),
      bootstrap: vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] }),
      upsertCompetitionResult,
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(1);
    expect(upsertCompetitionResult).toHaveBeenCalled();
  });

  it('records one error and imports nothing when external system bootstrap fails', async () => {
    const bootstrap = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['BBL', 'Name'] },
        message: 'network timeout',
      },
    });
    const upsertCompetitionResult = vi.fn();
    const service = makeService({
      reader: makeReader({ se: [page('se', { s: '66' })] }),
      listParser: makeListParser([{ bblId: '1', name: 'Major Season 1' }]),
      matchListReader: makeMatchListReader({}),
      bootstrap,
      upsertCompetitionResult,
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toBe('network timeout');
    expect(result.errors[0].item).toEqual({
      externalSystems: ['BBL', 'Name'],
    });
    expect(upsertCompetitionResult).not.toHaveBeenCalled();
  });

  it('records an error and reports zero imports when the master list page fails to parse', async () => {
    const listParser = new CompetitionListPageParser(normalizeText);
    vi.spyOn(listParser, 'extractCompetitions').mockImplementation(() => {
      throw new Error('bad se page');
    });
    const upsertCompetitionResult = vi.fn();
    const service = makeService({
      reader: makeReader({
        se: [page('se', { s: '66' })],
      }),
      listParser,
      matchListReader: makeMatchListReader({}),
      bootstrap: vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] }),
      upsertCompetitionResult,
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(0);
    expect(upsertCompetitionResult).not.toHaveBeenCalled();
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
    const upsertCompetitionResult = vi.fn().mockResolvedValue({ id: 74 });
    const service = makeService({
      reader: makeReader({
        se: [page('se', { s: '66' })],
      }),
      listParser: makeListParser([{ bblId: '74', name: 'Minor Season 25' }]),
      matchListReader: makeMatchListReader({}),
      bootstrap: vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] }),
      upsertCompetitionResult,
      getEras: () => [
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
      ],
    });

    const { result, competitionsByBblId, competitionIdsByBblId } =
      await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(upsertCompetitionResult).toHaveBeenCalledWith(
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
    const upsertCompetitionResult = vi.fn().mockResolvedValue({ id: 74 });
    const service = makeService({
      reader: makeReader({
        se: [page('se', { s: '66' })],
      }),
      listParser: makeListParser([{ bblId: '74', name: 'Minor Season 25' }]),
      // Dates fall in the "Living rulebook" range and span 1 day (would be a
      // cup); the override must still pin BB2020 (era 200) and type season.
      matchListReader: makeMatchListReader({
        '74': [new Date(Date.UTC(2012, 0, 1)), new Date(Date.UTC(2012, 0, 2))],
      }),
      bootstrap: vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] }),
      upsertCompetitionResult,
      getEras: () => [
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
      ],
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(1);
    expect(upsertCompetitionResult).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'season', eraId: 200 }),
      expect.any(Array),
    );
  });

  it('applies cupCompetitionIdOverrides forcing type cup even when the span would compute season', async () => {
    const upsertCompetitionResult = vi.fn().mockResolvedValue({ id: 33 });
    const service = makeService({
      reader: makeReader({ se: [page('se', { s: '66' })] }),
      listParser: makeListParser([{ bblId: '33', name: 'Stunty Leeg 2' }]),
      // 6-day span -> would compute 'season' under CUP_MAX_SPAN_DAYS; the cup
      // override must force 'cup' and pin the Living rulebook era (100).
      matchListReader: makeMatchListReader({
        '33': [
          new Date(Date.UTC(2016, 10, 19)),
          new Date(Date.UTC(2016, 10, 25)),
        ],
      }),
      bootstrap: vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] }),
      upsertCompetitionResult,
      getEras: () => [
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
      ],
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(1);
    expect(upsertCompetitionResult).toHaveBeenCalledWith(
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
    const upsertCompetitionResult = vi.fn().mockResolvedValue({ id: 30 });
    const service = makeService({
      reader: makeReader({ se: [page('se', { s: '66' })] }),
      listParser: makeListParser([{ bblId: '30', name: 'Stunty Leeg 1' }]),
      matchListReader: makeMatchListReader({
        '30': [new Date(Date.UTC(2016, 2, 12))],
      }),
      bootstrap: vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] }),
      upsertCompetitionResult,
      getEras: () => [
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
      ],
    });

    const overlapEraIds = new Map<string, number>([
      ['Living rulebook', 100],
      ['Stunty', 300],
    ]);
    const { result } = await service.importCompetitions(overlapEraIds);

    expect(result.imported).toBe(1);
    expect(upsertCompetitionResult).toHaveBeenCalledWith(
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
    const upsertCompetitionResult = vi
      .fn()
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce({ id: 30 });
    const service = makeService({
      reader: makeReader({ se: [page('se', { s: '66' })] }),
      getEras: () => overrideOnlyEras,
      listParser: makeListParser([
        { bblId: '1', name: 'Dated Season' },
        { bblId: '30', name: 'Side Cup' },
      ]),
      matchListReader: makeMatchListReader({
        '1': [new Date('2016-06-01'), new Date('2016-08-01')],
        '30': [new Date('2016-06-15')],
      }),
      bootstrap: vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] }),
      upsertCompetitionResult,
    });

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

    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertCompetitionResult = vi.fn().mockResolvedValue({ id: 1 });
    const service = makeService({
      reader: makeReader({ se: [page('se', { s: '55' })] }),
      listParser: makeListParser([{ bblId: '55', name: 'GBBL 1' }]),
      matchListReader: makeMatchListReader({ '55': [new Date('2019-08-03')] }),
      bootstrap,
      upsertCompetitionResult,
      getEras: () => erasWithGbbl,
    });

    await service.importCompetitions(eraIds);

    expect(upsertCompetitionResult).toHaveBeenCalledWith(
      expect.objectContaining({ eraId: 900, type: 'season' }),
      expect.anything(),
    );
  });
});
