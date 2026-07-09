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

/** A fake team page carrying its race name in params for the stub parser. */
function page(raceName: string | null): BblPage {
  return {
    type: 'tm',
    params: { race: raceName ?? '' },
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

/** A parser that reads the race name straight from params.race. */
function makeParser(): RacePageParser {
  const parser = new RacePageParser();
  vi.spyOn(parser, 'extractRace').mockImplementation((p) =>
    p.params.race ? { name: p.params.race } : null,
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

  it('upserts each race with exact-name BBL and Name external IDs', async () => {
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

    const result = await service.importRaces();

    expect(result.imported).toBe(1);
    expect(upsertRace).toHaveBeenCalledWith(
      {
        name: 'Orc',
        externalIds: [
          { externalSystemId: 1, externalId: 'Orc' },
          { externalSystemId: 2, externalId: 'Orc' },
        ],
      },
      expect.any(Array),
    );
  });

  it('deduplicates a race appearing on multiple team pages', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertRace = vi.fn().mockResolvedValue(true);
    const service = makeService(
      makeReader([page('Orc'), page('Orc'), page('Elf')]),
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
        p.params.race ? { name: p.params.race } : null,
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
