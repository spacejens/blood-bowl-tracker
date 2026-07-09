import type {
  ExternalSystemsImportService,
  ImportError,
  LeaguesImportService,
} from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import { BblLeaguesImportService } from './bbl-leagues-import.service';
import type { LeagueConfigService } from './league-config.service';

function makeService(
  getLeagueName: () => string,
  upsertExternalSystem: ReturnType<typeof vi.fn>,
  upsertLeague: ReturnType<typeof vi.fn>,
) {
  return new BblLeaguesImportService(
    { getLeagueName } as unknown as LeagueConfigService,
    { upsertLeague } as unknown as LeaguesImportService,
    { upsertExternalSystem } as unknown as ExternalSystemsImportService,
  );
}

describe('BblLeaguesImportService', () => {
  it('upserts the BBL and Name external systems', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertLeague = vi.fn().mockResolvedValue(true);
    const service = makeService(
      () => 'Test League',
      upsertExternalSystem,
      upsertLeague,
    );

    await service.importLeague();

    expect(upsertExternalSystem).toHaveBeenCalledTimes(2);
    expect(upsertExternalSystem).toHaveBeenNthCalledWith(1, 'BBL');
    expect(upsertExternalSystem).toHaveBeenNthCalledWith(2, 'Name');
  });

  it('upserts the league with its name as the BBL and Name external IDs', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertLeague = vi.fn().mockResolvedValue(true);
    const service = makeService(
      () => 'Test League',
      upsertExternalSystem,
      upsertLeague,
    );

    const result = await service.importLeague();

    expect(result.imported).toBe(1);
    expect(result.success).toBe(true);
    expect(upsertLeague).toHaveBeenCalledWith(
      {
        name: 'Test League',
        externalIds: [
          { externalSystemId: 1, externalId: 'Test League' },
          { externalSystemId: 2, externalId: 'Test League' },
        ],
      },
      expect.any(Array),
    );
  });

  it('records an error and imports nothing when the league upsert fails', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertLeague = vi
      .fn()
      .mockImplementation((_data: unknown, errors: ImportError[]) => {
        errors.push({ item: {}, message: 'Failed to import league' });
        return Promise.resolve(false);
      });
    const service = makeService(
      () => 'Test League',
      upsertExternalSystem,
      upsertLeague,
    );

    const result = await service.importLeague();

    expect(result.imported).toBe(0);
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it('records one error and skips the league when BBL_LEAGUE_NAME is unset', async () => {
    const upsertExternalSystem = vi.fn();
    const upsertLeague = vi.fn();
    const service = makeService(
      () => {
        throw new Error('BBL_LEAGUE_NAME is not set.');
      },
      upsertExternalSystem,
      upsertLeague,
    );

    const result = await service.importLeague();

    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.message.includes('BBL_LEAGUE_NAME')),
    ).toBe(true);
    expect(upsertLeague).not.toHaveBeenCalled();
  });

  it('records one error and skips the league when an external system upsert fails', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockRejectedValue(
        new Error('Failed to upsert external system "BBL": internal error'),
      );
    const upsertLeague = vi.fn();
    const service = makeService(
      () => 'Test League',
      upsertExternalSystem,
      upsertLeague,
    );

    const result = await service.importLeague();

    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.message.includes('external system')),
    ).toBe(true);
    expect(upsertLeague).not.toHaveBeenCalled();
  });

  it('stringifies a non-Error thrown while resolving config or systems', async () => {
    const upsertExternalSystem = vi.fn().mockRejectedValue('boom');
    const upsertLeague = vi.fn();
    const service = makeService(
      () => 'Test League',
      upsertExternalSystem,
      upsertLeague,
    );

    const result = await service.importLeague();

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('boom'))).toBe(true);
    expect(upsertLeague).not.toHaveBeenCalled();
  });
});
