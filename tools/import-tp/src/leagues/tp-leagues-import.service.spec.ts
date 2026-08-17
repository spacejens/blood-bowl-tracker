import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  LeaguesImportService,
  NameExternalIdService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

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

/**
 * The canned ImportResult the mocked ImportResultService.result returns.
 * ImportResultService's own `success: errors.length === 0` derivation is
 * covered by packages/import/src/import-result.service.spec.ts; this spec
 * asserts what the service under test *passes to* result() (via
 * `resultArgs()`) and that it returns result()'s value unchanged.
 */
const CANNED_RESULT: ImportResult = {
  success: false,
  imported: -1,
  errors: [{ item: { canned: true }, message: 'canned import result' }],
};

/** The `{ imported, errors }` the service under test handed to ImportResultService.result. */
function resultArgs(importResults: MockProxy<ImportResultService>): {
  imported: number;
  errors: ImportError[];
} {
  return importResults.result.mock.calls[0][0];
}

async function makeService({
  getLeagueName,
  bootstrap,
  upsertLeague,
  getTpSystemName = () => 'TP',
}: MakeServiceOptions): Promise<{
  service: TpLeaguesImportService;
  importResults: MockProxy<ImportResultService>;
}> {
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
  // The shared helper's mockImportResultService() only provides the exempt
  // `error` identity mock; `result` is stubbed with a canned value here.
  // ImportResultService.result's own success derivation is covered by
  // packages/import/src/import-result.service.spec.ts.
  importResults.result.mockReturnValue(CANNED_RESULT);

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
  return {
    service: moduleRef.get(TpLeaguesImportService),
    importResults,
  };
}

describe('TpLeaguesImportService', () => {
  it('upserts the league under the TP and Name external systems', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertLeague = vi
      .fn()
      .mockResolvedValue({ id: 10, name: 'tLoEGBBL' });
    const { service, importResults } = await makeService({
      getLeagueName: () => 'tLoEGBBL',
      bootstrap,
      upsertLeague,
    });

    await service.importLeague();

    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(1);
    expect(errors).toEqual([]);
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

  it('records one error and imports nothing when the league name is unset', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertLeague = vi.fn();
    const { service, importResults } = await makeService({
      getLeagueName: () => {
        throw new Error('league.name is not set in import-tp-config.json5');
      },
      bootstrap,
      upsertLeague,
    });

    await service.importLeague();

    expect(resultArgs(importResults).errors).toHaveLength(1);
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
    const { service, importResults } = await makeService({
      getLeagueName: () => 'tLoEGBBL',
      bootstrap,
      upsertLeague,
    });

    await service.importLeague();

    const { errors } = resultArgs(importResults);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('network timeout');
    expect(errors[0].item).toEqual({ externalSystems: ['TP', 'Name'] });
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
    const { service, importResults } = await makeService({
      getLeagueName: () => 'tLoEGBBL',
      bootstrap,
      upsertLeague,
    });

    await service.importLeague();

    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(0);
    expect(errors).toHaveLength(1);
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertLeague = vi
      .fn()
      .mockResolvedValue({ id: 10, name: 'tLoEGBBL' });
    const { service } = await makeService({
      getLeagueName: () => 'tLoEGBBL',
      bootstrap,
      upsertLeague,
    });

    const { result } = await service.importLeague();

    expect(result).toBe(CANNED_RESULT);
  });
});
