import { describe, it, expect, vi } from 'vitest';
import type {
  RacesImportService,
  ExternalSystemsImportService,
  ImportError,
} from '@blood-bowl-tracker/import';
import type { BblSourceReader } from '../source/bbl-source-reader';
import type { BblPage } from '../source/bbl-page';
import { RacePageParser } from './race-page-parser';
import { BblRacesImportService } from './bbl-races-import.service';

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

function makeService(
  reader: BblSourceReader,
  upsertExternalSystem: ReturnType<typeof vi.fn>,
  upsertRace: ReturnType<typeof vi.fn>,
) {
  return new BblRacesImportService(
    reader,
    makeParser(),
    { upsertRace } as unknown as RacesImportService,
    { upsertExternalSystem } as unknown as ExternalSystemsImportService,
  );
}

describe('BblRacesImportService', () => {
  it('upserts the BBL and Name external systems', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertRace = vi.fn().mockResolvedValue(true);
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

  it('upserts each race with a numeric BBL external ID and a Name external ID', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertRace = vi.fn().mockResolvedValue(true);
    const service = makeService(
      makeReader([page('Orc', '16')]),
      upsertExternalSystem,
      upsertRace,
    );

    const result = await service.importRaces();

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
    const upsertRace = vi.fn().mockResolvedValue(true);
    const service = makeService(
      makeReader([page('Orc', '16'), page('Orc', '16'), page('Elf', '6')]),
      upsertExternalSystem,
      upsertRace,
    );

    const result = await service.importRaces();

    expect(upsertRace).toHaveBeenCalledTimes(2);
    expect(result.imported).toBe(2);
  });

  it('skips team pages that have no race', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertRace = vi.fn().mockResolvedValue(true);
    const service = makeService(
      makeReader([page(null), page('Elf')]),
      upsertExternalSystem,
      upsertRace,
    );

    const result = await service.importRaces();

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
        return Promise.resolve(false);
      })
      .mockResolvedValueOnce(true);
    const service = makeService(
      makeReader([page('Orc'), page('Elf')]),
      upsertExternalSystem,
      upsertRace,
    );

    const result = await service.importRaces();

    expect(result.success).toBe(false);
    expect(result.imported).toBe(1);
    expect(result.errors.some((e) => e.message.includes('Orc'))).toBe(true);
  });

  it('records an error and continues when a team page fails to parse', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertRace = vi.fn().mockResolvedValue(true);
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
      { upsertRace } as unknown as RacesImportService,
      { upsertExternalSystem } as unknown as ExternalSystemsImportService,
    );

    const result = await service.importRaces();

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
    const upsertRace = vi.fn().mockResolvedValue(true);
    const parser = new RacePageParser();
    vi.spyOn(parser, 'extractRace').mockImplementationOnce(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'bad page';
    });
    const service = new BblRacesImportService(
      makeReader([page('Orc')]),
      parser,
      { upsertRace } as unknown as RacesImportService,
      { upsertExternalSystem } as unknown as ExternalSystemsImportService,
    );

    const result = await service.importRaces();

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

    const result = await service.importRaces();

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

    const result = await service.importRaces();

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('boom'))).toBe(true);
    expect(upsertRace).not.toHaveBeenCalled();
  });
});
