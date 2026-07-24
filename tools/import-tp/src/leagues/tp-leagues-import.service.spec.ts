import {
  ExternalSystemBootstrapService,
  ImportResultService,
  LeaguesImportService,
  NameExternalIdService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';

import {
  asProviderMethod,
  mockImportResultService,
  mockNameExternalIdService,
} from '../import-package.test-helpers';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { LeagueConfigService } from './league-config.service';
import { TpLeaguesImportService } from './tp-leagues-import.service';

interface MakeServiceOptions {
  getLeagueName: () => string;
  bootstrap: ReturnType<typeof vi.fn>;
  upsertLeague: ReturnType<typeof vi.fn>;
  getTpSystemName?: () => string;
}

async function makeService({
  getLeagueName,
  bootstrap,
  upsertLeague,
  getTpSystemName = () => 'TP',
}: MakeServiceOptions): Promise<TpLeaguesImportService> {
  const leagueConfig = mock<LeagueConfigService>();
  leagueConfig.getLeagueName.mockImplementation(getLeagueName);
  const leaguesImport = mock<LeaguesImportService>();
  leaguesImport.upsertLeague.mockImplementation(asProviderMethod(upsertLeague));
  const externalSystemBootstrap = mock<ExternalSystemBootstrapService>();
  externalSystemBootstrap.bootstrap.mockImplementation(
    asProviderMethod(bootstrap),
  );
  const externalSystemName = mock<ExternalSystemNameConfigService>();
  externalSystemName.getTpSystemName.mockImplementation(getTpSystemName);
  const nameExternalId = mockNameExternalIdService();
  const importResults = mockImportResultService();

  const moduleRef = await Test.createTestingModule({
    providers: [
      TpLeaguesImportService,
      { provide: LeagueConfigService, useValue: leagueConfig },
      { provide: LeaguesImportService, useValue: leaguesImport },
      {
        provide: ExternalSystemBootstrapService,
        useValue: externalSystemBootstrap,
      },
      {
        provide: ExternalSystemNameConfigService,
        useValue: externalSystemName,
      },
      { provide: NameExternalIdService, useValue: nameExternalId },
      { provide: ImportResultService, useValue: importResults },
    ],
  }).compile();
  return moduleRef.get(TpLeaguesImportService);
}

describe('TpLeaguesImportService', () => {
  it('upserts the league under the TP and Name external systems', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertLeague = vi
      .fn()
      .mockResolvedValue({ id: 10, name: 'tLoEGBBL' });
    const service = await makeService({
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
    const service = await makeService({
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
    const service = await makeService({
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
    const service = await makeService({
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
