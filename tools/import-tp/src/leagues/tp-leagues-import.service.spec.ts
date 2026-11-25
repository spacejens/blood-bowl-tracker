import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  LeaguesImportService,
  NameExternalIdService,
  TP_EXTERNAL_SYSTEM_NAME,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import {
  asProviderMethod,
  mockImportResultService,
  mockNameExternalIdService,
} from '../import-package.test-helpers';
import { LeagueConfigService } from './league-config.service';
import { TpLeaguesImportService } from './tp-leagues-import.service';

interface MakeServiceOptions {
  getLeagueName: () => string;
  bootstrap: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
}

/**
 * The canned ImportResult the mocked ImportResultService.result returns.
 * ImportResultService's own `success: errors.length === 0` derivation is
 * covered by packages/import-shared/src/import-result.service.spec.ts; this spec
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
  upsert,
}: MakeServiceOptions): Promise<{
  service: TpLeaguesImportService;
  importResults: MockProxy<ImportResultService>;
}> {
  const leagueConfig = mock<LeagueConfigService>();
  leagueConfig.getLeagueName.mockImplementation(getLeagueName);
  const leaguesImport = mock<LeaguesImportService>();
  leaguesImport.upsert.mockImplementation(asProviderMethod(upsert));
  const externalSystemBootstrap = mock<ExternalSystemBootstrapService>();
  externalSystemBootstrap.bootstrap.mockImplementation(
    asProviderMethod(bootstrap),
  );
  const nameExternalId = mockNameExternalIdService();
  const importResults = mockImportResultService();
  // The shared helper's mockImportResultService() only provides the exempt
  // `error` identity mock; `result` is stubbed with a canned value here.
  // ImportResultService.result's own success derivation is covered by
  // packages/import-shared/src/import-result.service.spec.ts.
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
  it('attaches the TP id to the curated league, found by its Name id, sending no name', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsert = vi.fn().mockResolvedValue({ id: 10, name: 'tLoEG' });
    const { service, importResults } = await makeService({
      getLeagueName: () => 'tLoEG',
      bootstrap,
      upsert,
    });

    await service.importLeague();

    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(1);
    expect(errors).toEqual([]);
    expect(bootstrap).toHaveBeenCalledWith([
      { name: TP_EXTERNAL_SYSTEM_NAME, category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
    // The Name id is batch 001's, so the TP league lands on the curated
    // tLoEG row whether or not the BBL importer ran first.
    expect(upsert).toHaveBeenCalledWith(
      {
        externalIds: [
          { externalSystemId: 2, externalId: 'tLoEG' },
          { externalSystemId: 1, externalId: 'tLoEG' },
        ],
      },
      expect.any(Array),
    );
  });

  it('keeps only the upsert error for a league missing from the catalog', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const missingField = {
      item: { externalIds: [] },
      message: 'Failed to import league "Unknown": name is required',
    };
    const upsert = vi
      .fn()
      .mockImplementation((_data: unknown, errors: unknown[]) => {
        errors.push(missingField);
        return Promise.resolve(undefined);
      });
    const { service, importResults } = await makeService({
      getLeagueName: () => 'Unknown',
      bootstrap,
      upsert,
    });

    await service.importLeague();

    expect(resultArgs(importResults)).toEqual({
      imported: 0,
      errors: [missingField],
    });
  });

  it('records one error and imports nothing when the league name is unset', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsert = vi.fn();
    const { service, importResults } = await makeService({
      getLeagueName: () => {
        throw new Error('league.name is not set in import-tp-config.json5');
      },
      bootstrap,
      upsert,
    });

    await service.importLeague();

    expect(resultArgs(importResults).errors).toHaveLength(1);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('stringifies a non-Error thrown while reading the league name', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsert = vi.fn();
    const { service, importResults } = await makeService({
      getLeagueName: () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'league.name is not set';
      },
      bootstrap,
      upsert,
    });

    await service.importLeague();

    expect(resultArgs(importResults).errors).toHaveLength(1);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('records one error when the external system bootstrap fails', async () => {
    const bootstrap = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: [TP_EXTERNAL_SYSTEM_NAME, 'Name'] },
        message: 'network timeout',
      },
    });
    const upsert = vi.fn();
    const { service, importResults } = await makeService({
      getLeagueName: () => 'tLoEG',
      bootstrap,
      upsert,
    });

    await service.importLeague();

    const { errors } = resultArgs(importResults);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('network timeout');
    expect(errors[0].item).toEqual({
      externalSystems: [TP_EXTERNAL_SYSTEM_NAME, 'Name'],
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsert = vi.fn().mockResolvedValue({ id: 10, name: 'tLoEG' });
    const { service } = await makeService({
      getLeagueName: () => 'tLoEG',
      bootstrap,
      upsert,
    });

    const { result } = await service.importLeague();

    expect(result).toBe(CANNED_RESULT);
  });
});
