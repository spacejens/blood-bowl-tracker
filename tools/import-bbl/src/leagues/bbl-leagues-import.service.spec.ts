import {
  ExternalSystemBootstrapService,
  ImportResultService,
  LeaguesImportService,
  NameExternalIdService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { BblLeaguesImportService } from './bbl-leagues-import.service';
import { LeagueConfigService } from './league-config.service';

interface Mocks {
  config: MockProxy<LeagueConfigService>;
  leaguesImport: MockProxy<LeaguesImportService>;
  bootstrap: MockProxy<ExternalSystemBootstrapService>;
  nameConfig: MockProxy<ExternalSystemNameConfigService>;
}

/**
 * Builds the service under test through a TestingModule with every
 * collaborator mocked. Deterministic collaborators (name resolution, error
 * building) mirror the real production logic so a regression in the service
 * under test still fails these tests.
 */
async function makeService(): Promise<{
  service: BblLeaguesImportService;
  mocks: Mocks;
}> {
  const config = mock<LeagueConfigService>();

  const leaguesImport = mock<LeaguesImportService>();

  const bootstrap = mock<ExternalSystemBootstrapService>();
  bootstrap.bootstrap.mockResolvedValue({ ok: true, ids: [1, 2] });

  const nameConfig = mock<ExternalSystemNameConfigService>();
  nameConfig.getBblSystemName.mockReturnValue('BBL');

  const nameExternalId = mock<NameExternalIdService>();
  nameExternalId.forLeague.mockImplementation((name) => name);

  const importResults = mock<ImportResultService>();
  importResults.error.mockImplementation((args) => ({
    item: args.item,
    message: args.message,
  }));
  importResults.result.mockImplementation((args) => ({
    success: args.errors.length === 0,
    imported: args.imported,
    errors: args.errors,
  }));

  const moduleRef = await Test.createTestingModule({
    providers: [
      BblLeaguesImportService,
      { provide: LeagueConfigService, useValue: config },
      { provide: LeaguesImportService, useValue: leaguesImport },
      { provide: ExternalSystemBootstrapService, useValue: bootstrap },
      { provide: ExternalSystemNameConfigService, useValue: nameConfig },
      { provide: NameExternalIdService, useValue: nameExternalId },
      { provide: ImportResultService, useValue: importResults },
    ],
  }).compile();

  return {
    service: moduleRef.get(BblLeaguesImportService),
    mocks: { config, leaguesImport, bootstrap, nameConfig },
  };
}

describe('BblLeaguesImportService', () => {
  it('bootstraps the BBL and Name external systems once', async () => {
    const { service, mocks } = await makeService();
    mocks.config.getLeagueNames.mockReturnValue(['tLoEG']);
    mocks.leaguesImport.upsertLeague.mockResolvedValue({
      id: 42,
      name: 'tLoEG',
      createdAt: new Date('2026-01-01'),
      created: true,
    });

    await service.importLeagues();

    expect(mocks.bootstrap.bootstrap).toHaveBeenCalledTimes(1);
    expect(mocks.bootstrap.bootstrap).toHaveBeenCalledWith([
      { name: 'BBL', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
  });

  it('bootstraps the configured BBL system name', async () => {
    const { service, mocks } = await makeService();
    mocks.config.getLeagueNames.mockReturnValue(['tLoEG']);
    mocks.leaguesImport.upsertLeague.mockResolvedValue({
      id: 1,
      name: 'x',
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    mocks.nameConfig.getBblSystemName.mockReturnValue('MyLeague');

    await service.importLeagues();

    expect(mocks.bootstrap.bootstrap).toHaveBeenCalledWith([
      { name: 'MyLeague', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
  });

  it('upserts every configured league and returns their ids by name', async () => {
    const { service, mocks } = await makeService();
    mocks.config.getLeagueNames.mockReturnValue(['tLoEG', 'GBBL']);
    mocks.leaguesImport.upsertLeague
      .mockResolvedValueOnce({
        id: 42,
        name: 'tLoEG',
        createdAt: new Date('2026-01-01'),
        created: true,
      })
      .mockResolvedValueOnce({
        id: 43,
        name: 'GBBL',
        createdAt: new Date('2026-01-01'),
        created: true,
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
    expect(mocks.leaguesImport.upsertLeague).toHaveBeenNthCalledWith(
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
    expect(mocks.leaguesImport.upsertLeague).toHaveBeenNthCalledWith(
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
    const { service, mocks } = await makeService();
    mocks.config.getLeagueNames.mockReturnValue(['tLoEG', 'GBBL']);
    mocks.leaguesImport.upsertLeague
      .mockResolvedValueOnce({
        id: 42,
        name: 'tLoEG',
        createdAt: new Date('2026-01-01'),
        created: true,
      })
      .mockImplementationOnce((_data, errors) => {
        errors.push({ item: {}, message: 'Failed to import league' });
        return Promise.resolve(undefined);
      });

    const { result, leagueIdsByName } = await service.importLeagues();

    expect(result.imported).toBe(1);
    expect(result.success).toBe(false);
    expect(leagueIdsByName.get('tLoEG')).toBe(42);
    expect(leagueIdsByName.has('GBBL')).toBe(false);
  });

  it('records one error and imports nothing when leagues config is invalid', async () => {
    const { service, mocks } = await makeService();
    mocks.config.getLeagueNames.mockImplementation(() => {
      throw new Error('leagues is not set in import-bbl-config.json5');
    });

    const { result } = await service.importLeagues();

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('leagues'))).toBe(true);
    expect(mocks.leaguesImport.upsertLeague).not.toHaveBeenCalled();
  });

  it('records one error and imports nothing when an external system upsert fails', async () => {
    const { service, mocks } = await makeService();
    mocks.config.getLeagueNames.mockReturnValue(['tLoEG']);
    mocks.bootstrap.bootstrap.mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['BBL', 'Name'] },
        message: 'network timeout',
      },
    });

    const { result } = await service.importLeagues();

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toBe('network timeout');
    expect(result.errors[0].item).toEqual({
      externalSystems: ['BBL', 'Name'],
    });
    expect(mocks.leaguesImport.upsertLeague).not.toHaveBeenCalled();
  });
});
