import type {
  CoachesImportService,
  ExternalSystemsImportService,
  ImportError,
} from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { BblPage } from '../source/bbl-page';
import type { BblSourceReader } from '../source/bbl-source-reader';
import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { BblCoachesImportService } from './bbl-coaches-import.service';
import { CoachPageParser } from './coach-page-parser';

/** A fake team page carrying its coach name in params for the stub parser. */
function page(coachName: string | null): BblPage {
  return {
    type: 'tm',
    params: { coach: coachName ?? '' },
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

/** A parser that reads the coach name straight from params.coach. */
function makeParser(): CoachPageParser {
  const parser = new CoachPageParser();
  vi.spyOn(parser, 'extractCoach').mockImplementation((p) =>
    p.params.coach ? { name: p.params.coach } : null,
  );
  return parser;
}

function makeService(
  reader: BblSourceReader,
  upsertExternalSystem: ReturnType<typeof vi.fn>,
  upsertCoach: ReturnType<typeof vi.fn>,
  getBblSystemName: () => string = () => 'BBL',
) {
  return new BblCoachesImportService(
    reader,
    makeParser(),
    { upsertCoach } as unknown as CoachesImportService,
    { upsertExternalSystem } as unknown as ExternalSystemsImportService,
    { getBblSystemName } as unknown as ExternalSystemNameConfigService,
  );
}

describe('BblCoachesImportService', () => {
  it('upserts the BBL and Name external systems', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertCoach = vi.fn().mockResolvedValue({
      id: 100,
      name: 'Hugo E',
      createdAt: new Date(),
      created: true,
    });
    const service = makeService(
      makeReader([page('Hugo E')]),
      upsertExternalSystem,
      upsertCoach,
    );

    await service.importCoaches();

    expect(upsertExternalSystem).toHaveBeenCalledTimes(2);
    expect(upsertExternalSystem).toHaveBeenNthCalledWith(1, 'BBL');
    expect(upsertExternalSystem).toHaveBeenNthCalledWith(2, 'Name');
  });

  it('upserts the configured BBL system name when BBL_EXTERNAL_SYSTEM_NAME is set', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertCoach = vi.fn().mockResolvedValue({
      id: 100,
      name: 'Hugo E',
      createdAt: new Date(),
      created: true,
    });
    const service = makeService(
      makeReader([page('Hugo E')]),
      upsertExternalSystem,
      upsertCoach,
      () => 'MyLeague',
    );

    await service.importCoaches();

    expect(upsertExternalSystem).toHaveBeenNthCalledWith(1, 'MyLeague');
    expect(upsertExternalSystem).toHaveBeenNthCalledWith(2, 'Name');
  });

  it('upserts each coach with exact-name BBL and Name external IDs', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertCoach = vi.fn().mockResolvedValue({
      id: 100,
      name: 'Hugo E',
      createdAt: new Date(),
      created: true,
    });
    const service = makeService(
      makeReader([page('Hugo E')]),
      upsertExternalSystem,
      upsertCoach,
    );

    const { result } = await service.importCoaches();

    expect(result.imported).toBe(1);
    expect(upsertCoach).toHaveBeenCalledWith(
      {
        name: 'Hugo E',
        externalIds: [
          { externalSystemId: 1, externalId: 'Hugo E' },
          { externalSystemId: 2, externalId: 'Hugo E' },
        ],
      },
      expect.any(Array),
    );
  });

  it('deduplicates a coach appearing on multiple team pages', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertCoach = vi.fn().mockResolvedValue({
      id: 100,
      name: 'Hugo E',
      createdAt: new Date(),
      created: true,
    });
    const service = makeService(
      makeReader([page('Hugo E'), page('Hugo E'), page('Tommy')]),
      upsertExternalSystem,
      upsertCoach,
    );

    const { result } = await service.importCoaches();

    expect(upsertCoach).toHaveBeenCalledTimes(2);
    expect(result.imported).toBe(2);
  });

  it('skips team pages that have no coach', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertCoach = vi.fn().mockResolvedValue({
      id: 100,
      name: 'Hugo E',
      createdAt: new Date(),
      created: true,
    });
    const service = makeService(
      makeReader([page(null), page('Tommy')]),
      upsertExternalSystem,
      upsertCoach,
    );

    const { result } = await service.importCoaches();

    expect(upsertCoach).toHaveBeenCalledTimes(1);
    expect(result.imported).toBe(1);
  });

  it('records an error and continues when a coach upsert fails', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertCoach = vi
      .fn()
      .mockImplementationOnce((_data: unknown, errors: ImportError[]) => {
        errors.push({ item: {}, message: 'Failed to import coach "Hugo E"' });
        return Promise.resolve(undefined);
      })
      .mockResolvedValue({
        id: 6,
        name: 'Tommy',
        createdAt: new Date(),
        created: true,
      });
    const service = makeService(
      makeReader([page('Hugo E'), page('Tommy')]),
      upsertExternalSystem,
      upsertCoach,
    );

    const { result } = await service.importCoaches();

    expect(result.success).toBe(false);
    expect(result.imported).toBe(1);
    expect(result.errors.some((e) => e.message.includes('Hugo E'))).toBe(true);
  });

  it('records an error and continues when a team page fails to parse', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertCoach = vi.fn().mockResolvedValue({
      id: 100,
      name: 'Hugo E',
      createdAt: new Date(),
      created: true,
    });
    const parser = new CoachPageParser();
    vi.spyOn(parser, 'extractCoach')
      .mockImplementationOnce(() => {
        throw new Error('bad page');
      })
      .mockImplementationOnce((p) =>
        p.params.coach ? { name: p.params.coach } : null,
      );
    const service = new BblCoachesImportService(
      makeReader([page('Hugo E'), page('Tommy')]),
      parser,
      { upsertCoach } as unknown as CoachesImportService,
      { upsertExternalSystem } as unknown as ExternalSystemsImportService,
      {
        getBblSystemName: () => 'BBL',
      } as unknown as ExternalSystemNameConfigService,
    );

    const { result } = await service.importCoaches();

    expect(result.imported).toBe(1);
    expect(upsertCoach).toHaveBeenCalledTimes(1);
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
    const upsertCoach = vi.fn().mockResolvedValue({
      id: 100,
      name: 'Hugo E',
      createdAt: new Date(),
      created: true,
    });
    const parser = new CoachPageParser();
    vi.spyOn(parser, 'extractCoach').mockImplementationOnce(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'bad page';
    });
    const service = new BblCoachesImportService(
      makeReader([page('Hugo E')]),
      parser,
      { upsertCoach } as unknown as CoachesImportService,
      { upsertExternalSystem } as unknown as ExternalSystemsImportService,
      {
        getBblSystemName: () => 'BBL',
      } as unknown as ExternalSystemNameConfigService,
    );

    const { result } = await service.importCoaches();

    expect(result.imported).toBe(0);
    expect(result.errors.some((e) => e.message.includes('bad page'))).toBe(
      true,
    );
  });

  it('records one error and skips coaches when an external system upsert fails', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockRejectedValue(
        new Error('Failed to upsert external system "BBL": internal error'),
      );
    const upsertCoach = vi.fn();
    const service = makeService(
      makeReader([page('Hugo E')]),
      upsertExternalSystem,
      upsertCoach,
    );

    const { result } = await service.importCoaches();

    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.message.includes('external system')),
    ).toBe(true);
    expect(upsertCoach).not.toHaveBeenCalled();
  });

  it('stringifies a non-Error thrown by the external system upsert', async () => {
    const upsertExternalSystem = vi.fn().mockRejectedValue('boom');
    const upsertCoach = vi.fn();
    const service = makeService(
      makeReader([page('Hugo E')]),
      upsertExternalSystem,
      upsertCoach,
    );

    const { result } = await service.importCoaches();

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('boom'))).toBe(true);
    expect(upsertCoach).not.toHaveBeenCalled();
  });

  it('returns a coachIdsByName map from coach name to upserted db id', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertCoach = vi
      .fn()
      .mockResolvedValueOnce({
        id: 100,
        name: 'Hugo E',
        createdAt: new Date(),
        created: true,
      })
      .mockResolvedValueOnce({
        id: 200,
        name: 'Roze Madder',
        createdAt: new Date(),
        created: true,
      });
    const service = makeService(
      makeReader([page('Hugo E'), page('Roze Madder')]),
      upsertExternalSystem,
      upsertCoach,
    );

    const { coachIdsByName } = await service.importCoaches();

    expect(coachIdsByName.get('Hugo E')).toBe(100);
    expect(coachIdsByName.get('Roze Madder')).toBe(200);
  });
});
