import type {
  ExternalSystemsImportService,
  ImportError,
  RacesImportService,
} from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { BblPage } from '../source/bbl-page';
import type { BblSourceReader } from '../source/bbl-source-reader';
import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { BblRacesImportService } from './bbl-races-import.service';
import { RaceListPageParser } from './race-list-page-parser';
import type { BblRace } from './race-page-parser';
import { RacePageParser } from './race-page-parser';

/**
 * A fake team page carrying its race name and numeric BBL id in params for the
 * stub parser. The id defaults to one derived from the name so distinct races
 * get distinct ids; pass an explicit id to control it.
 */
function page(raceName: string | null, id?: string): BblPage {
  return {
    type: 'tm',
    params: {
      race: raceName ?? '',
      raceId: raceName ? (id ?? `id-${raceName}`) : '',
    },
    load: () => {
      throw new Error('load() should not be called in this test');
    },
  };
}

/** A source reader whose pages() yields the given fake pages. */
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

/** A parser that reads the race id and name straight from the page params. */
function makeParser(): RacePageParser {
  const parser = new RacePageParser();
  vi.spyOn(parser, 'extractRace').mockImplementation((p) =>
    p.params.race ? { id: p.params.raceId, name: p.params.race } : null,
  );
  return parser;
}

/** A race-list parser that yields no races — the default for tm-only tests. */
function makeEmptyListParser(): RaceListPageParser {
  const parser = new RaceListPageParser();
  vi.spyOn(parser, 'extractRaces').mockReturnValue([]);
  return parser;
}

/** A race-list parser that reads its races array straight from page params. */
function makeListParser(): RaceListPageParser {
  const parser = new RaceListPageParser();
  vi.spyOn(parser, 'extractRaces').mockImplementation(
    (p) => JSON.parse(p.params.races) as BblRace[],
  );
  return parser;
}

/** A fake tl (race-list) page carrying a JSON array of races in params. */
function listPage(races: BblRace[]): BblPage {
  return {
    type: 'tl',
    params: { races: JSON.stringify(races) },
    load: () => {
      throw new Error('load() should not be called in this test');
    },
  };
}

/** A source reader whose pages(type) yields the pages registered for that type. */
function makeReaderByType(
  pagesByType: Record<string, BblPage[]>,
): BblSourceReader {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    async *pages(type: string) {
      for (const p of pagesByType[type] ?? []) {
        yield p;
      }
    },
  } as unknown as BblSourceReader;
}

function upsertRaceOk() {
  let nextId = 100;
  return vi.fn().mockImplementation((data: { name: string }) =>
    Promise.resolve({
      id: nextId++,
      name: data.name,
      createdAt: new Date('2026-01-01'),
      created: true,
    }),
  );
}

function makeService(
  reader: BblSourceReader,
  upsertExternalSystem: ReturnType<typeof vi.fn>,
  upsertRace: ReturnType<typeof vi.fn>,
  getBblSystemName: () => string = () => 'BBL',
  listParser: RaceListPageParser = makeEmptyListParser(),
) {
  return new BblRacesImportService(
    reader,
    makeParser(),
    listParser,
    { upsertRace } as unknown as RacesImportService,
    { upsertExternalSystem } as unknown as ExternalSystemsImportService,
    { getBblSystemName } as unknown as ExternalSystemNameConfigService,
  );
}

describe('BblRacesImportService', () => {
  it('upserts the BBL and Name external systems', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertRace = upsertRaceOk();
    const service = makeService(
      makeReader([page('Orc')]),
      upsertExternalSystem,
      upsertRace,
    );

    await service.importRaces();

    expect(upsertExternalSystem).toHaveBeenCalledTimes(2);
    expect(upsertExternalSystem).toHaveBeenNthCalledWith(1, 'BBL');
    expect(upsertExternalSystem).toHaveBeenNthCalledWith(2, 'Name');
  });

  it('upserts the configured BBL system name when BBL_EXTERNAL_SYSTEM_NAME is set', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertRace = upsertRaceOk();
    const service = makeService(
      makeReader([page('Orc', '16')]),
      upsertExternalSystem,
      upsertRace,
      () => 'MyLeague',
    );

    await service.importRaces();

    expect(upsertExternalSystem).toHaveBeenNthCalledWith(1, 'MyLeague');
    expect(upsertExternalSystem).toHaveBeenNthCalledWith(2, 'Name');
  });

  it('upserts each race with a numeric BBL external ID and a Name external ID', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertRace = upsertRaceOk();
    const service = makeService(
      makeReader([page('Orc', '16')]),
      upsertExternalSystem,
      upsertRace,
    );

    const { result } = await service.importRaces();

    expect(result.imported).toBe(1);
    expect(upsertRace).toHaveBeenCalledWith(
      {
        name: 'Orc',
        externalIds: [
          { externalSystemId: 1, externalId: '16' },
          { externalSystemId: 2, externalId: 'Orc' },
        ],
      },
      expect.any(Array),
    );
  });

  it('deduplicates a race (by id) appearing on multiple team pages', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertRace = upsertRaceOk();
    const service = makeService(
      makeReader([page('Orc', '16'), page('Orc', '16'), page('Elf', '6')]),
      upsertExternalSystem,
      upsertRace,
    );

    const { result } = await service.importRaces();

    expect(upsertRace).toHaveBeenCalledTimes(2);
    expect(result.imported).toBe(2);
  });

  it('skips team pages that have no race', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertRace = upsertRaceOk();
    const service = makeService(
      makeReader([page(null), page('Elf')]),
      upsertExternalSystem,
      upsertRace,
    );

    const { result } = await service.importRaces();

    expect(upsertRace).toHaveBeenCalledTimes(1);
    expect(result.imported).toBe(1);
  });

  it('records an error and continues when a race upsert fails', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertRace = vi
      .fn()
      .mockImplementationOnce((_data: unknown, errors: ImportError[]) => {
        errors.push({ item: {}, message: 'Failed to import race "Orc"' });
        return Promise.resolve(undefined);
      })
      .mockResolvedValueOnce({
        id: 101,
        name: 'Elf',
        createdAt: new Date('2026-01-01'),
        created: true,
      });
    const service = makeService(
      makeReader([page('Orc'), page('Elf')]),
      upsertExternalSystem,
      upsertRace,
    );

    const { result } = await service.importRaces();

    expect(result.success).toBe(false);
    expect(result.imported).toBe(1);
    expect(result.errors.some((e) => e.message.includes('Orc'))).toBe(true);
  });

  it('records an error and continues when a team page fails to parse', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertRace = upsertRaceOk();
    const parser = new RacePageParser();
    vi.spyOn(parser, 'extractRace')
      .mockImplementationOnce(() => {
        throw new Error('bad page');
      })
      .mockImplementationOnce((p) =>
        p.params.race ? { id: p.params.raceId, name: p.params.race } : null,
      );
    const service = new BblRacesImportService(
      makeReader([page('Orc'), page('Elf')]),
      parser,
      makeEmptyListParser(),
      { upsertRace } as unknown as RacesImportService,
      { upsertExternalSystem } as unknown as ExternalSystemsImportService,
      {
        getBblSystemName: () => 'BBL',
      } as unknown as ExternalSystemNameConfigService,
    );

    const { result } = await service.importRaces();

    expect(result.imported).toBe(1);
    expect(upsertRace).toHaveBeenCalledTimes(1);
    expect(
      result.errors.some((e) =>
        e.message.includes('Failed to parse team page'),
      ),
    ).toBe(true);
  });

  it('records a stringified error when a team page throws a non-Error value', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertRace = upsertRaceOk();
    const parser = new RacePageParser();
    vi.spyOn(parser, 'extractRace').mockImplementationOnce(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'bad page';
    });
    const service = new BblRacesImportService(
      makeReader([page('Orc')]),
      parser,
      makeEmptyListParser(),
      { upsertRace } as unknown as RacesImportService,
      { upsertExternalSystem } as unknown as ExternalSystemsImportService,
      {
        getBblSystemName: () => 'BBL',
      } as unknown as ExternalSystemNameConfigService,
    );

    const { result } = await service.importRaces();

    expect(result.imported).toBe(0);
    expect(result.errors.some((e) => e.message.includes('bad page'))).toBe(
      true,
    );
  });

  it('records one error and skips races when an external system upsert fails', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockRejectedValue(
        new Error('Failed to upsert external system "BBL": internal error'),
      );
    const upsertRace = vi.fn();
    const service = makeService(
      makeReader([page('Orc')]),
      upsertExternalSystem,
      upsertRace,
    );

    const { result } = await service.importRaces();

    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.message.includes('external system')),
    ).toBe(true);
    expect(upsertRace).not.toHaveBeenCalled();
  });

  it('stringifies a non-Error thrown by the external system upsert', async () => {
    const upsertExternalSystem = vi.fn().mockRejectedValue('boom');
    const upsertRace = vi.fn();
    const service = makeService(
      makeReader([page('Orc')]),
      upsertExternalSystem,
      upsertRace,
    );

    const { result } = await service.importRaces();

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('boom'))).toBe(true);
    expect(upsertRace).not.toHaveBeenCalled();
  });

  it('returns a map from each race BBL id to its local id', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertRace = vi.fn().mockImplementation((data: { name: string }) =>
      Promise.resolve({
        id: data.name === 'Orc' ? 100 : 200,
        name: data.name,
        createdAt: new Date('2026-01-01'),
        created: true,
      }),
    );
    const service = makeService(
      makeReader([page('Orc', '16'), page('Elf', '6')]),
      upsertExternalSystem,
      upsertRace,
    );

    const { raceIdsByBblId } = await service.importRaces();

    expect(raceIdsByBblId.get('16')).toBe(100);
    expect(raceIdsByBblId.get('6')).toBe(200);
  });

  it('returns a map from each race BBL id to its local id and name', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertRace = vi.fn().mockImplementation((data: { name: string }) =>
      Promise.resolve({
        id: data.name === 'Orc' ? 100 : 200,
        name: data.name,
        createdAt: new Date('2026-01-01'),
        created: true,
      }),
    );
    const service = makeService(
      makeReader([page('Orc', '16'), page('Elf', '6')]),
      upsertExternalSystem,
      upsertRace,
    );

    const { racesByBblId } = await service.importRaces();

    expect(racesByBblId.get('16')).toEqual({ id: 100, name: 'Orc' });
    expect(racesByBblId.get('6')).toEqual({ id: 200, name: 'Elf' });
  });

  it('returns a map from each race local id to its upsert data', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertRace = vi.fn().mockImplementation((data: { name: string }) =>
      Promise.resolve({
        id: data.name === 'Orc' ? 100 : 200,
        name: data.name,
        createdAt: new Date('2026-01-01'),
        created: true,
      }),
    );
    const service = makeService(
      makeReader([page('Orc', '16'), page('Elf', '6')]),
      upsertExternalSystem,
      upsertRace,
    );

    const { racesByRaceId } = await service.importRaces();

    expect(racesByRaceId.get(100)).toEqual({
      name: 'Orc',
      externalIds: [
        { externalSystemId: 1, externalId: '16' },
        { externalSystemId: 2, externalId: 'Orc' },
      ],
    });
    expect(racesByRaceId.get(200)).toEqual({
      name: 'Elf',
      externalIds: [
        { externalSystemId: 1, externalId: '6' },
        { externalSystemId: 2, externalId: 'Elf' },
      ],
    });
  });

  it('imports a race found only on the tl page (no team page)', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertRace = upsertRaceOk();
    const service = makeService(
      makeReaderByType({
        tm: [page('Orc', '16')],
        tl: [listPage([{ id: '48', name: 'College of Shadow' }])],
      }),
      upsertExternalSystem,
      upsertRace,
      () => 'BBL',
      makeListParser(),
    );

    const { result } = await service.importRaces();

    expect(result.imported).toBe(2);
    expect(upsertRace).toHaveBeenCalledWith(
      {
        name: 'College of Shadow',
        externalIds: [
          { externalSystemId: 1, externalId: '48' },
          { externalSystemId: 2, externalId: 'College of Shadow' },
        ],
      },
      expect.any(Array),
    );
  });

  it('does not re-import a race already found via a team page (first pass wins)', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertRace = upsertRaceOk();
    const service = makeService(
      makeReaderByType({
        tm: [page('Orc', '16')],
        tl: [listPage([{ id: '16', name: 'Orc (tl heading)' }])],
      }),
      upsertExternalSystem,
      upsertRace,
      () => 'BBL',
      makeListParser(),
    );

    const { result } = await service.importRaces();

    expect(result.imported).toBe(1);
    expect(upsertRace).toHaveBeenCalledTimes(1);
    expect(upsertRace).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Orc' }),
      expect.any(Array),
    );
  });

  it('imports a race present only on old team pages and absent from tl', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertRace = upsertRaceOk();
    const service = makeService(
      makeReaderByType({
        tm: [page('Retired Race', '22')],
        tl: [listPage([])],
      }),
      upsertExternalSystem,
      upsertRace,
      () => 'BBL',
      makeListParser(),
    );

    const { result } = await service.importRaces();

    expect(result.imported).toBe(1);
    expect(upsertRace).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Retired Race' }),
      expect.any(Array),
    );
  });

  it('records an error and continues when a tl page fails to parse', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertRace = upsertRaceOk();
    const listParser = new RaceListPageParser();
    vi.spyOn(listParser, 'extractRaces').mockImplementation(() => {
      throw new Error('bad race list page');
    });
    const service = makeService(
      makeReaderByType({
        tm: [page('Orc', '16')],
        tl: [listPage([])],
      }),
      upsertExternalSystem,
      upsertRace,
      () => 'BBL',
      listParser,
    );

    const { result } = await service.importRaces();

    expect(result.imported).toBe(1);
    expect(upsertRace).toHaveBeenCalledTimes(1);
    expect(
      result.errors.some((e) =>
        e.message.includes('Failed to parse race list page'),
      ),
    ).toBe(true);
  });

  it('records a stringified error when a tl page throws a non-Error value', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertRace = upsertRaceOk();
    const listParser = new RaceListPageParser();
    vi.spyOn(listParser, 'extractRaces').mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'bad race list page';
    });
    const service = makeService(
      makeReaderByType({
        tm: [page('Orc', '16')],
        tl: [listPage([])],
      }),
      upsertExternalSystem,
      upsertRace,
      () => 'BBL',
      listParser,
    );

    const { result } = await service.importRaces();

    expect(result.imported).toBe(1);
    expect(
      result.errors.some((e) => e.message.includes('bad race list page')),
    ).toBe(true);
  });
});
