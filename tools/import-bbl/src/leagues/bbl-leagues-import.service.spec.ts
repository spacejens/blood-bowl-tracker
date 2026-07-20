import type {
  ExternalSystemBootstrapService,
  ImportError,
  LeaguesImportService,
} from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { BblLeaguesImportService } from './bbl-leagues-import.service';
import type { LeagueConfigService } from './league-config.service';

interface MakeServiceOptions {
  getLeagueName: () => string;
  bootstrap: ReturnType<typeof vi.fn>;
  upsertLeague: ReturnType<typeof vi.fn>;
  getBblSystemName?: () => string;
}

function makeService({
  getLeagueName,
  bootstrap,
  upsertLeague,
  getBblSystemName = () => 'BBL',
}: MakeServiceOptions) {
  return new BblLeaguesImportService(
    { getLeagueName } as unknown as LeagueConfigService,
    { upsertLeague } as unknown as LeaguesImportService,
    { bootstrap } as unknown as ExternalSystemBootstrapService,
    { getBblSystemName } as unknown as ExternalSystemNameConfigService,
  );
}

describe('BblLeaguesImportService', () => {
  it('bootstraps the BBL and Name external systems', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertLeague = vi.fn().mockResolvedValue({
      id: 42,
      name: 'Test League',
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    const service = makeService({
      getLeagueName: () => 'Test League',
      bootstrap,
      upsertLeague,
    });

    await service.importLeague();

    expect(bootstrap).toHaveBeenCalledWith(['BBL', 'Name']);
  });

  it('bootstraps the configured BBL system name when BBL_EXTERNAL_SYSTEM_NAME is set', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertLeague = vi.fn().mockResolvedValue(true);
    const service = makeService({
      getLeagueName: () => 'Test League',
      bootstrap,
      upsertLeague,
      getBblSystemName: () => 'MyLeague',
    });

    await service.importLeague();

    expect(bootstrap).toHaveBeenCalledWith(['MyLeague', 'Name']);
  });

  it('upserts the league with its name as the BBL and Name external IDs', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertLeague = vi.fn().mockResolvedValue({
      id: 42,
      name: 'Test League',
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    const service = makeService({
      getLeagueName: () => 'Test League',
      bootstrap,
      upsertLeague,
    });

    const result = await service.importLeague();

    expect(result.result.imported).toBe(1);
    expect(result.result.success).toBe(true);
    expect(result.leagueId).toBe(42);
    expect(bootstrap).toHaveBeenCalledWith(['BBL', 'Name']);
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
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertLeague = vi
      .fn()
      .mockImplementation((_data: unknown, errors: ImportError[]) => {
        errors.push({ item: {}, message: 'Failed to import league' });
        return Promise.resolve(undefined);
      });
    const service = makeService({
      getLeagueName: () => 'Test League',
      bootstrap,
      upsertLeague,
    });

    const result = await service.importLeague();

    expect(result.result.imported).toBe(0);
    expect(result.result.success).toBe(false);
    expect(result.result.errors).toHaveLength(1);
    expect(result.leagueId).toBeUndefined();
  });

  it('records one error and skips the league when BBL_LEAGUE_NAME is unset', async () => {
    const bootstrap = vi.fn();
    const upsertLeague = vi.fn();
    const service = makeService({
      getLeagueName: () => {
        throw new Error('BBL_LEAGUE_NAME is not set.');
      },
      bootstrap,
      upsertLeague,
    });

    const result = await service.importLeague();

    expect(result.result.success).toBe(false);
    expect(
      result.result.errors.some((e) => e.message.includes('BBL_LEAGUE_NAME')),
    ).toBe(true);
    expect(upsertLeague).not.toHaveBeenCalled();
  });

  it('records one error and skips the league when an external system upsert fails', async () => {
    const bootstrap = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['BBL', 'Name'] },
        message: 'network timeout',
      },
    });
    const upsertLeague = vi.fn();
    const service = makeService({
      getLeagueName: () => 'Test League',
      bootstrap,
      upsertLeague,
    });

    const result = await service.importLeague();

    expect(result.result.success).toBe(false);
    expect(result.result.errors).toHaveLength(1);
    // Message is passed through unchanged (this caller adds no prefix): the
    // assertion now fails if production stops surfacing the real error text.
    expect(result.result.errors[0].message).toBe('network timeout');
    // And the error names the external systems the bootstrap tried to upsert.
    expect(result.result.errors[0].item).toEqual({
      externalSystems: ['BBL', 'Name'],
    });
    expect(upsertLeague).not.toHaveBeenCalled();
  });
});
