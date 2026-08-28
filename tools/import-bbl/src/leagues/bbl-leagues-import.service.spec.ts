import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  LeaguesImportService,
  NameExternalIdService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { BblLeaguesImportService } from './bbl-leagues-import.service';
import { LeagueConfigService } from './league-config.service';

/**
 * The canned ImportResult the mocked ImportResultService.result returns.
 * ImportResultService's own `success: errors.length === 0` derivation is
 * covered by packages/import/src/import-result.service.spec.ts; this spec
 * asserts what the service under test *passes to* result() (via
 * `resultArgs()`) and that it returns result()'s value unchanged. The
 * deliberately impossible field values make any leftover assertion that reads
 * the returned object instead of the recorded call arguments fail loudly.
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

interface Mocks {
  config: MockProxy<LeagueConfigService>;
  leaguesImport: MockProxy<LeaguesImportService>;
  bootstrap: MockProxy<ExternalSystemBootstrapService>;
  nameConfig: MockProxy<ExternalSystemNameConfigService>;
  importResults: MockProxy<ImportResultService>;
}

describe('BblLeaguesImportService', () => {
  let service: BblLeaguesImportService;
  let mocks: Mocks;

  /**
   * Builds the service under test through a TestingModule with every
   * collaborator mocked. Deterministic collaborators (name resolution, error
   * building) mirror the real production logic so a regression in the service
   * under test still fails these tests.
   */
  beforeEach(async () => {
    const config = mock<LeagueConfigService>();

    const leaguesImport = mock<LeaguesImportService>();

    const bootstrap = mock<ExternalSystemBootstrapService>();
    bootstrap.bootstrap.mockResolvedValue({ ok: true, ids: [1, 2] });

    const nameConfig = mock<ExternalSystemNameConfigService>();
    nameConfig.getBblSystemName.mockReturnValue('BBL');

    const nameExternalId = mock<NameExternalIdService>();
    // `forLeague` is a pure identity passthrough with no branching or
    // formatting, so there is no algorithm here that can drift out of sync with
    // the real NameExternalIdService — exempt from the canned-response rule.
    nameExternalId.forLeague.mockImplementation((name) => name);

    const importResults = mock<ImportResultService>();
    // `error` is a pure identity field copy with no branching or formatting, so
    // there is no algorithm here that can drift out of sync with the real
    // ImportResultService — exempt from the canned-response rule.
    importResults.error.mockImplementation((args) => ({
      item: args.item,
      message: args.message,
    }));
    importResults.result.mockReturnValue(CANNED_RESULT);

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

    service = moduleRef.get(BblLeaguesImportService);
    mocks = { config, leaguesImport, bootstrap, nameConfig, importResults };
  });

  it('bootstraps the BBL and Name external systems once', async () => {
    mocks.config.getLeagueNames.mockReturnValue(['tLoEG']);
    mocks.leaguesImport.upsert.mockResolvedValue({
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
    mocks.config.getLeagueNames.mockReturnValue(['tLoEG']);
    mocks.leaguesImport.upsert.mockResolvedValue({
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

  it('upserts every configured league', async () => {
    mocks.config.getLeagueNames.mockReturnValue(['tLoEG', 'GBBL']);
    mocks.leaguesImport.upsert
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

    await service.importLeagues();

    expect(resultArgs(mocks.importResults).imported).toBe(2);
    expect(mocks.leaguesImport.upsert).toHaveBeenNthCalledWith(
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
    expect(mocks.leaguesImport.upsert).toHaveBeenNthCalledWith(
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
    mocks.config.getLeagueNames.mockReturnValue(['tLoEG', 'GBBL']);
    mocks.leaguesImport.upsert
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

    await service.importLeagues();

    expect(resultArgs(mocks.importResults).imported).toBe(1);
  });

  it('records one error and imports nothing when leagues config is invalid', async () => {
    mocks.config.getLeagueNames.mockImplementation(() => {
      throw new Error('leagues is not set in import-bbl-config.json5');
    });

    await service.importLeagues();

    expect(
      resultArgs(mocks.importResults).errors.some((e) =>
        e.message.includes('leagues'),
      ),
    ).toBe(true);
    expect(mocks.leaguesImport.upsert).not.toHaveBeenCalled();
  });

  it('records one error and imports nothing when an external system upsert fails', async () => {
    mocks.config.getLeagueNames.mockReturnValue(['tLoEG']);
    mocks.bootstrap.bootstrap.mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['BBL', 'Name'] },
        message: 'network timeout',
      },
    });

    await service.importLeagues();

    const { errors } = resultArgs(mocks.importResults);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('network timeout');
    expect(errors[0].item).toEqual({
      externalSystems: ['BBL', 'Name'],
    });
    expect(mocks.leaguesImport.upsert).not.toHaveBeenCalled();
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    mocks.config.getLeagueNames.mockReturnValue(['tLoEG']);
    mocks.leaguesImport.upsert.mockResolvedValue({
      id: 42,
      name: 'tLoEG',
      createdAt: new Date('2026-01-01'),
      created: true,
    });

    const { result } = await service.importLeagues();

    expect(result).toBe(CANNED_RESULT);
  });
});
