import type {
  ExternalSystemBootstrapService,
  LeaguesImportService,
} from '@blood-bowl-tracker/import';
import { NameExternalIdService } from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { LeagueConfigService } from './league-config.service';
import { TpLeaguesImportService } from './tp-leagues-import.service';

interface MakeServiceOptions {
  getLeagueName: () => string;
  bootstrap: ReturnType<typeof vi.fn>;
  upsertLeague: ReturnType<typeof vi.fn>;
  getTpSystemName?: () => string;
}

function makeService({
  getLeagueName,
  bootstrap,
  upsertLeague,
  getTpSystemName = () => 'TP',
}: MakeServiceOptions) {
  return new TpLeaguesImportService(
    { getLeagueName } as unknown as LeagueConfigService,
    { upsertLeague } as unknown as LeaguesImportService,
    { bootstrap } as unknown as ExternalSystemBootstrapService,
    { getTpSystemName } as unknown as ExternalSystemNameConfigService,
    new NameExternalIdService(),
  );
}

describe('TpLeaguesImportService', () => {
  it('upserts the league under the TP and Name external systems', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertLeague = vi
      .fn()
      .mockResolvedValue({ id: 10, name: 'tLoEGBBL' });
    const service = makeService({
      getLeagueName: () => 'tLoEGBBL',
      bootstrap,
      upsertLeague,
    });

    const { result, leagueId } = await service.importLeague();

    expect(result.imported).toBe(1);
    expect(result.success).toBe(true);
    expect(leagueId).toBe(10);
    expect(bootstrap).toHaveBeenCalledWith([
      { name: 'TP', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
    expect(upsertLeague).toHaveBeenCalledWith(
      {
        name: 'tLoEGBBL',
        externalIds: [
          { externalSystemId: 1, externalId: 'tLoEGBBL' },
          { externalSystemId: 2, externalId: 'tLoEGBBL' },
        ],
      },
      expect.any(Array),
    );
  });

  it('records one error and no leagueId when the league name is unset', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertLeague = vi.fn();
    const service = makeService({
      getLeagueName: () => {
        throw new Error('league.name is not set in import-tp-config.json5');
      },
      bootstrap,
      upsertLeague,
    });

    const { result, leagueId } = await service.importLeague();

    expect(result.success).toBe(false);
    expect(leagueId).toBeUndefined();
    expect(upsertLeague).not.toHaveBeenCalled();
  });

  it('records one error when the external system bootstrap fails', async () => {
    const bootstrap = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['TP', 'Name'] },
        message: 'network timeout',
      },
    });
    const upsertLeague = vi.fn();
    const service = makeService({
      getLeagueName: () => 'tLoEGBBL',
      bootstrap,
      upsertLeague,
    });

    const { result } = await service.importLeague();

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toBe('network timeout');
    expect(result.errors[0].item).toEqual({ externalSystems: ['TP', 'Name'] });
    expect(upsertLeague).not.toHaveBeenCalled();
  });

  it('reports zero imported when the league upsert fails', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertLeague = vi
      .fn()
      .mockImplementation((_data: unknown, errors: { message: string }[]) => {
        errors.push({ message: 'league boom' });
        return Promise.resolve(undefined);
      });
    const service = makeService({
      getLeagueName: () => 'tLoEGBBL',
      bootstrap,
      upsertLeague,
    });

    const { result, leagueId } = await service.importLeague();

    expect(result.imported).toBe(0);
    expect(result.success).toBe(false);
    expect(leagueId).toBeUndefined();
  });
});
