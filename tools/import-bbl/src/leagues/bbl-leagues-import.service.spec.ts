import type {
  ExternalSystemBootstrapService,
  ImportError,
  LeaguesImportService,
} from '@blood-bowl-tracker/import';
import { NameExternalIdService } from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { BblLeaguesImportService } from './bbl-leagues-import.service';
import type { LeagueConfigService } from './league-config.service';

interface MakeServiceOptions {
  getLeagueNames: () => string[];
  bootstrap: ReturnType<typeof vi.fn>;
  upsertLeague: ReturnType<typeof vi.fn>;
  getBblSystemName?: () => string;
}

function makeService({
  getLeagueNames,
  bootstrap,
  upsertLeague,
  getBblSystemName = () => 'BBL',
}: MakeServiceOptions) {
  return new BblLeaguesImportService(
    { getLeagueNames } as unknown as LeagueConfigService,
    { upsertLeague } as unknown as LeaguesImportService,
    { bootstrap } as unknown as ExternalSystemBootstrapService,
    { getBblSystemName } as unknown as ExternalSystemNameConfigService,
    new NameExternalIdService(),
  );
}

describe('BblLeaguesImportService', () => {
  it('bootstraps the BBL and Name external systems once', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertLeague = vi
      .fn()
      .mockResolvedValue({ id: 42, name: 'tLoEG', created: true });
    const service = makeService({
      getLeagueNames: () => ['tLoEG'],
      bootstrap,
      upsertLeague,
    });

    await service.importLeagues();

    expect(bootstrap).toHaveBeenCalledTimes(1);
    expect(bootstrap).toHaveBeenCalledWith([
      { name: 'BBL', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
  });

  it('bootstraps the configured BBL system name', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertLeague = vi.fn().mockResolvedValue({ id: 1, name: 'x' });
    const service = makeService({
      getLeagueNames: () => ['tLoEG'],
      bootstrap,
      upsertLeague,
      getBblSystemName: () => 'MyLeague',
    });

    await service.importLeagues();

    expect(bootstrap).toHaveBeenCalledWith([
      { name: 'MyLeague', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
  });

  it('upserts every configured league and returns their ids by name', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertLeague = vi
      .fn()
      .mockResolvedValueOnce({ id: 42, name: 'tLoEG' })
      .mockResolvedValueOnce({ id: 43, name: 'GBBL' });
    const service = makeService({
      getLeagueNames: () => ['tLoEG', 'GBBL'],
      bootstrap,
      upsertLeague,
    });

    const { result, leagueIdsByName } = await service.importLeagues();

    expect(result.imported).toBe(2);
    expect(result.success).toBe(true);
    expect(leagueIdsByName).toEqual(
      new Map([
        ['tLoEG', 42],
        ['GBBL', 43],
      ]),
    );
    expect(upsertLeague).toHaveBeenNthCalledWith(
      1,
      {
        name: 'tLoEG',
        externalIds: [
          { externalSystemId: 1, externalId: 'tLoEG' },
          { externalSystemId: 2, externalId: 'tLoEG' },
        ],
      },
      expect.any(Array),
    );
    expect(upsertLeague).toHaveBeenNthCalledWith(
      2,
      {
        name: 'GBBL',
        externalIds: [
          { externalSystemId: 1, externalId: 'GBBL' },
          { externalSystemId: 2, externalId: 'GBBL' },
        ],
      },
      expect.any(Array),
    );
  });

  it('records an error and omits a league whose upsert fails, keeping the others', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertLeague = vi
      .fn()
      .mockResolvedValueOnce({ id: 42, name: 'tLoEG' })
      .mockImplementationOnce((_data: unknown, errors: ImportError[]) => {
        errors.push({ item: {}, message: 'Failed to import league' });
        return Promise.resolve(undefined);
      });
    const service = makeService({
      getLeagueNames: () => ['tLoEG', 'GBBL'],
      bootstrap,
      upsertLeague,
    });

    const { result, leagueIdsByName } = await service.importLeagues();

    expect(result.imported).toBe(1);
    expect(result.success).toBe(false);
    expect(leagueIdsByName.get('tLoEG')).toBe(42);
    expect(leagueIdsByName.has('GBBL')).toBe(false);
  });

  it('records one error and imports nothing when leagues config is invalid', async () => {
    const bootstrap = vi.fn();
    const upsertLeague = vi.fn();
    const service = makeService({
      getLeagueNames: () => {
        throw new Error('leagues is not set in import-bbl-config.json5');
      },
      bootstrap,
      upsertLeague,
    });

    const { result } = await service.importLeagues();

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('leagues'))).toBe(true);
    expect(upsertLeague).not.toHaveBeenCalled();
  });

  it('records one error and imports nothing when an external system upsert fails', async () => {
    const bootstrap = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['BBL', 'Name'] },
        message: 'network timeout',
      },
    });
    const upsertLeague = vi.fn();
    const service = makeService({
      getLeagueNames: () => ['tLoEG'],
      bootstrap,
      upsertLeague,
    });

    const { result } = await service.importLeagues();

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toBe('network timeout');
    expect(result.errors[0].item).toEqual({ externalSystems: ['BBL', 'Name'] });
    expect(upsertLeague).not.toHaveBeenCalled();
  });
});
