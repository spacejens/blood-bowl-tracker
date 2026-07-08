import { describe, it, expect, vi } from 'vitest';
import type {
  CoachesImportService,
  ExternalSystemsImportService,
  ImportError,
} from '@blood-bowl-tracker/import';
import type { BblSourceReader } from '../source/bbl-source-reader';
import type { BblPage } from '../source/bbl-page';
import { CoachPageParser } from './coach-page-parser';
import { BblCoachesImportService } from './bbl-coaches-import.service';

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
) {
  return new BblCoachesImportService(
    reader,
    makeParser(),
    { upsertCoach } as unknown as CoachesImportService,
    { upsertExternalSystem } as unknown as ExternalSystemsImportService,
  );
}

describe('BblCoachesImportService', () => {
  it('upserts the BBL and Name external systems', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertCoach = vi.fn().mockResolvedValue(true);
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

  it('upserts each coach with exact-name BBL and Name external IDs', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertCoach = vi.fn().mockResolvedValue(true);
    const service = makeService(
      makeReader([page('Hugo E')]),
      upsertExternalSystem,
      upsertCoach,
    );

    const result = await service.importCoaches();

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
    const upsertCoach = vi.fn().mockResolvedValue(true);
    const service = makeService(
      makeReader([page('Hugo E'), page('Hugo E'), page('Tommy')]),
      upsertExternalSystem,
      upsertCoach,
    );

    const result = await service.importCoaches();

    expect(upsertCoach).toHaveBeenCalledTimes(2);
    expect(result.imported).toBe(2);
  });

  it('skips team pages that have no coach', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertCoach = vi.fn().mockResolvedValue(true);
    const service = makeService(
      makeReader([page(null), page('Tommy')]),
      upsertExternalSystem,
      upsertCoach,
    );

    const result = await service.importCoaches();

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
        return Promise.resolve(false);
      })
      .mockResolvedValueOnce(true);
    const service = makeService(
      makeReader([page('Hugo E'), page('Tommy')]),
      upsertExternalSystem,
      upsertCoach,
    );

    const result = await service.importCoaches();

    expect(result.success).toBe(false);
    expect(result.imported).toBe(1);
    expect(result.errors.some((e) => e.message.includes('Hugo E'))).toBe(true);
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

    const result = await service.importCoaches();

    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.message.includes('external system')),
    ).toBe(true);
    expect(upsertCoach).not.toHaveBeenCalled();
  });
});
