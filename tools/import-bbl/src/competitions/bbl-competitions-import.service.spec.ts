import type {
  CompetitionsImportService,
  ExternalSystemsImportService,
} from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { EraConfig, EraConfigService } from '../eras/era-config.service';
import type { BblMatchListReaderService } from '../matches/bbl-match-list-reader.service';
import type { BblMatch } from '../matches/match-list-page-parser';
import type { BblPage } from '../source/bbl-page';
import type { BblSourceReader } from '../source/bbl-source-reader';
import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { BblCompetitionsImportService } from './bbl-competitions-import.service';
import { CompetitionListPageParser } from './competition-list-page-parser';

const erasConfig: EraConfig[] = [
  {
    name: 'Living rulebook',
    rulesSet: 'Living rulebook',
    startDate: '2011-09-09',
    endDate: '2021-09-01',
  },
  { name: 'BB2020', rulesSet: 'BB2020', startDate: '2021-09-01' },
];

const eraIdsByName = new Map<string, number>([
  ['Living rulebook', 100],
  ['BB2020', 200],
]);

/** A fake page carrying only params; its load() must never be called (parsers are spied). */
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
  const parser = new CompetitionListPageParser();
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
          homeTeam: '',
          awayTeam: '',
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
  upsertExternalSystem: ReturnType<typeof vi.fn>;
  upsertCompetition: ReturnType<typeof vi.fn>;
  getEras?: () => EraConfig[];
}) {
  return new BblCompetitionsImportService(
    opts.reader,
    opts.listParser,
    opts.matchListReader,
    {
      upsertCompetition: opts.upsertCompetition,
    } as unknown as CompetitionsImportService,
    {
      upsertExternalSystem: opts.upsertExternalSystem,
    } as unknown as ExternalSystemsImportService,
    {
      getEras: opts.getEras ?? (() => erasConfig),
    } as unknown as EraConfigService,
    {
      getBblSystemName: () => 'BBL',
    } as unknown as ExternalSystemNameConfigService,
  );
}

describe('BblCompetitionsImportService', () => {
  it('derives type=season from a >3-day span and resolves the containing era', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertCompetition = vi.fn().mockResolvedValue(true);
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
      upsertExternalSystem,
      upsertCompetition,
    });

    const { result, competitionsByBblId } =
      await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(1);
    expect(upsertCompetition).toHaveBeenCalledWith(
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
  });

  it('derives type=cup from a <=3-day span', async () => {
    const upsertCompetition = vi.fn().mockResolvedValue(true);
    const service = makeService({
      reader: makeReader({
        se: [page('se', { s: '66' })],
      }),
      listParser: makeListParser([{ bblId: '5', name: 'Chaos Cup' }]),
      matchListReader: makeMatchListReader({
        '5': [new Date(Date.UTC(2021, 9, 2)), new Date(Date.UTC(2021, 9, 4))],
      }),
      upsertExternalSystem: vi
        .fn()
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2),
      upsertCompetition,
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(1);
    expect(upsertCompetition).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Chaos Cup', type: 'cup', eraId: 200 }),
      expect.any(Array),
    );
  });

  it('skips and records an error for a competition with no dated matches', async () => {
    const upsertCompetition = vi.fn();
    const service = makeService({
      reader: makeReader({
        se: [page('se', { s: '66' })],
      }),
      listParser: makeListParser([{ bblId: '9', name: 'In Progress' }]),
      matchListReader: makeMatchListReader({}),
      upsertExternalSystem: vi
        .fn()
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2),
      upsertCompetition,
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(0);
    expect(result.success).toBe(false);
    expect(upsertCompetition).not.toHaveBeenCalled();
    expect(
      result.errors.some((e) => e.message.includes('no dated matches')),
    ).toBe(true);
  });

  it('skips and records an error when no configured era contains the earliest match date', async () => {
    const upsertCompetition = vi.fn();
    const service = makeService({
      reader: makeReader({
        se: [page('se', { s: '66' })],
      }),
      listParser: makeListParser([{ bblId: '3', name: 'Ancient Season' }]),
      matchListReader: makeMatchListReader({
        '3': [new Date(Date.UTC(2000, 0, 1)), new Date(Date.UTC(2000, 5, 1))],
      }),
      upsertExternalSystem: vi
        .fn()
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2),
      upsertCompetition,
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(0);
    expect(upsertCompetition).not.toHaveBeenCalled();
    expect(
      result.errors.some((e) => e.message.includes('no configured era')),
    ).toBe(true);
  });

  it('skips and records a distinct error when the matched era has no known database id', async () => {
    const upsertCompetition = vi.fn();
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
      upsertExternalSystem: vi
        .fn()
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2),
      upsertCompetition,
      // "Living rulebook" matches by date, but is absent from eraIdsByName,
      // simulating its rules set having failed to import earlier in the run.
    });

    const { result } = await service.importCompetitions(new Map());

    expect(result.imported).toBe(0);
    expect(upsertCompetition).not.toHaveBeenCalled();
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

  it('falls back to an sr page for the master list when no se page exists', async () => {
    const upsertCompetition = vi.fn().mockResolvedValue(true);
    const service = makeService({
      reader: makeReader({
        se: [],
        sr: [page('sr', { s: '66' })],
      }),
      listParser: makeListParser([{ bblId: '1', name: 'Major Season 1' }]),
      matchListReader: makeMatchListReader({
        '1': [new Date(Date.UTC(2012, 0, 1)), new Date(Date.UTC(2012, 5, 1))],
      }),
      upsertExternalSystem: vi
        .fn()
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2),
      upsertCompetition,
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(1);
    expect(upsertCompetition).toHaveBeenCalled();
  });

  it('skips a bare se index page (no s param) and reads the list from the page that has one', async () => {
    // Mirrors the real BBL mirror's bare `default.asp?p=se` index page, which
    // has no `s` param and lacks the master `<option>` dropdown entirely, so
    // extractCompetitions correctly (but unhelpfully) returns [] for it.
    const listParser = new CompetitionListPageParser();
    vi.spyOn(listParser, 'extractCompetitions').mockImplementation((p) =>
      p.params.s === undefined ? [] : [{ bblId: '1', name: 'Major Season 1' }],
    );
    const upsertCompetition = vi.fn().mockResolvedValue(true);
    const service = makeService({
      reader: makeReader({
        se: [page('se', {}), page('se', { s: '66' })],
      }),
      listParser,
      matchListReader: makeMatchListReader({
        '1': [new Date(Date.UTC(2012, 0, 1)), new Date(Date.UTC(2012, 5, 1))],
      }),
      upsertExternalSystem: vi
        .fn()
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2),
      upsertCompetition,
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(1);
    expect(upsertCompetition).toHaveBeenCalled();
  });

  it('records one error and skips competitions when an external system upsert fails', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockRejectedValue(
        new Error('Failed to upsert external system "BBL": internal error'),
      );
    const upsertCompetition = vi.fn();
    const service = makeService({
      reader: makeReader({ se: [page('se', { s: '66' })] }),
      listParser: makeListParser([{ bblId: '1', name: 'Major Season 1' }]),
      matchListReader: makeMatchListReader({}),
      upsertExternalSystem,
      upsertCompetition,
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.message.includes('external system')),
    ).toBe(true);
    expect(upsertCompetition).not.toHaveBeenCalled();
  });

  it('records an error and reports zero imports when the master list page fails to parse', async () => {
    const listParser = new CompetitionListPageParser();
    vi.spyOn(listParser, 'extractCompetitions').mockImplementation(() => {
      throw new Error('bad se page');
    });
    const upsertCompetition = vi.fn();
    const service = makeService({
      reader: makeReader({
        se: [page('se', { s: '66' })],
      }),
      listParser,
      matchListReader: makeMatchListReader({}),
      upsertExternalSystem: vi
        .fn()
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2),
      upsertCompetition,
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(0);
    expect(upsertCompetition).not.toHaveBeenCalled();
    expect(
      result.errors.some((e) =>
        e.message.includes('Failed to parse master competition list page'),
      ),
    ).toBe(true);
    expect(
      result.errors.some((e) => e.message.includes('no se or sr page')),
    ).toBe(true);
  });
});
