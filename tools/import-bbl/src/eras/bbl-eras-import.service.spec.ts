import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  BBL_EXTERNAL_SYSTEM_NAME,
  ErasImportService,
  ExternalSystemBootstrapService,
  ImportResultService,
  NameExternalIdService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { era } from '../shared/curated-era.test-helpers';
import { BblErasImportService } from './bbl-eras-import.service';
import { type EraConfig, EraConfigService } from './era-config.service';

/**
 * The canned ImportResult the mocked ImportResultService.result returns.
 * ImportResultService's own `success: errors.length === 0` derivation is
 * covered by packages/import-shared/src/import-result.service.spec.ts; this spec
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
  eraConfig: MockProxy<EraConfigService>;
  erasImport: MockProxy<ErasImportService>;
  bootstrap: MockProxy<ExternalSystemBootstrapService>;
  importResults: MockProxy<ImportResultService>;
}

function configuredEra(name: string): EraConfig {
  return {
    leagueName: 'tLoEG',
    identity: { name },
    dates: { autoAssignByDate: true },
    players: { firstPlayerId: 1, autoAssignByPlayerId: true },
  };
}

const firstEra = era({
  id: 500,
  name: 'First era',
  rulesSetIds: [1, 2, 3],
  rulesSetNames: ['CRP', 'CRP+', 'BB2016'],
  endDate: '2021-09-01',
});
const secondEra = era({
  id: 501,
  name: 'Second era',
  rulesSetIds: [4],
  rulesSetNames: ['BB2020'],
  startDate: '2021-09-01',
});

describe('BblErasImportService', () => {
  let service: BblErasImportService;
  let mocks: Mocks;

  beforeEach(async () => {
    const eraConfig = mock<EraConfigService>();

    const erasImport = mock<ErasImportService>();

    const bootstrap = mock<ExternalSystemBootstrapService>();
    bootstrap.bootstrap.mockResolvedValue({ ok: true, ids: [1, 2] });

    const nameExternalId = mock<NameExternalIdService>();
    // `forEra` is a pure identity passthrough with no branching or formatting,
    // so there is no algorithm here that can drift out of sync with the real
    // NameExternalIdService — exempt from the canned-response rule.
    nameExternalId.forEra.mockImplementation((name) => name);

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
        BblErasImportService,
        { provide: EraConfigService, useValue: eraConfig },
        { provide: ErasImportService, useValue: erasImport },
        { provide: ExternalSystemBootstrapService, useValue: bootstrap },
        { provide: NameExternalIdService, useValue: nameExternalId },
        { provide: ImportResultService, useValue: importResults },
      ],
    }).compile();

    service = moduleRef.get(BblErasImportService);
    mocks = { eraConfig, erasImport, bootstrap, importResults };
  });

  it('bootstraps the BBL and Name external systems once', async () => {
    mocks.eraConfig.getEras.mockReturnValue([configuredEra('First era')]);
    mocks.erasImport.upsert.mockResolvedValue({ ...firstEra, created: false });

    await service.importEras();

    expect(mocks.bootstrap.bootstrap).toHaveBeenCalledTimes(1);
    expect(mocks.bootstrap.bootstrap).toHaveBeenCalledWith([
      { name: BBL_EXTERNAL_SYSTEM_NAME, category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
  });

  it('attaches the BBL id to each configured era, found by its Name id', async () => {
    mocks.eraConfig.getEras.mockReturnValue([
      configuredEra('First era'),
      configuredEra('Second era'),
    ]);
    mocks.erasImport.upsert
      .mockResolvedValueOnce({ ...firstEra, created: false })
      .mockResolvedValueOnce({ ...secondEra, created: false });

    await service.importEras();

    expect(mocks.erasImport.upsert).toHaveBeenNthCalledWith(
      1,
      {
        rulesSetIds: [],
        externalIds: [
          { externalSystemId: 2, externalId: 'First era' },
          { externalSystemId: 1, externalId: 'First era' },
        ],
      },
      expect.any(Array),
    );
    expect(mocks.erasImport.upsert).toHaveBeenNthCalledWith(
      2,
      {
        rulesSetIds: [],
        externalIds: [
          { externalSystemId: 2, externalId: 'Second era' },
          { externalSystemId: 1, externalId: 'Second era' },
        ],
      },
      expect.any(Array),
    );
    expect(resultArgs(mocks.importResults)).toEqual({
      imported: 2,
      errors: [],
    });
  });

  it('returns each upserted curated era keyed by its configured name', async () => {
    mocks.eraConfig.getEras.mockReturnValue([
      configuredEra('First era'),
      configuredEra('Second era'),
    ]);
    mocks.erasImport.upsert
      .mockResolvedValueOnce({ ...firstEra, created: false })
      .mockResolvedValueOnce({ ...secondEra, created: true });

    const { erasByName } = await service.importEras();

    expect([...erasByName.keys()]).toEqual(['First era', 'Second era']);
    expect(erasByName.get('First era')).toMatchObject({
      id: 500,
      rulesSetNames: ['CRP', 'CRP+', 'BB2016'],
      startDate: '2011-09-09',
      endDate: '2021-09-01',
    });
    expect(erasByName.get('Second era')?.rulesSetNames).toEqual(['BB2020']);
  });

  it('leaves an era whose upsert fails out of the map, keeping only its upsert error', async () => {
    mocks.eraConfig.getEras.mockReturnValue([
      configuredEra('Missing era'),
      configuredEra('Second era'),
    ]);
    const missingField = {
      item: { externalIds: [] },
      message: 'Failed to import era: name is required',
    };
    mocks.erasImport.upsert
      .mockImplementationOnce((_data, errors) => {
        errors.push(missingField);
        return Promise.resolve(undefined);
      })
      .mockResolvedValueOnce({ ...secondEra, created: false });

    const { erasByName } = await service.importEras();

    expect([...erasByName.keys()]).toEqual(['Second era']);
    expect(resultArgs(mocks.importResults)).toEqual({
      imported: 1,
      errors: [missingField],
    });
  });

  it('records one error and imports nothing when BBL_ERAS is unset', async () => {
    mocks.eraConfig.getEras.mockImplementation(() => {
      throw new Error('BBL_ERAS is not set.');
    });

    const { erasByName } = await service.importEras();

    expect(
      resultArgs(mocks.importResults).errors.some((e) =>
        e.message.includes('BBL_ERAS'),
      ),
    ).toBe(true);
    expect(mocks.erasImport.upsert).not.toHaveBeenCalled();
    expect(erasByName.size).toBe(0);
  });

  it('records one error and imports nothing when an external system upsert fails', async () => {
    mocks.eraConfig.getEras.mockReturnValue([configuredEra('First era')]);
    mocks.bootstrap.bootstrap.mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: [BBL_EXTERNAL_SYSTEM_NAME, 'Name'] },
        message: 'network timeout',
      },
    });

    const { erasByName } = await service.importEras();

    const { errors } = resultArgs(mocks.importResults);
    expect(errors).toHaveLength(1);
    // Message is passed through unchanged (this caller adds no prefix): the
    // exact match fails if production stops surfacing the real error text.
    expect(errors[0].message).toBe('network timeout');
    // And the error names the external systems the bootstrap tried to upsert.
    expect(errors[0].item).toEqual({
      externalSystems: [BBL_EXTERNAL_SYSTEM_NAME, 'Name'],
    });
    expect(mocks.erasImport.upsert).not.toHaveBeenCalled();
    expect(erasByName.size).toBe(0);
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    mocks.eraConfig.getEras.mockReturnValue([configuredEra('First era')]);
    mocks.erasImport.upsert.mockResolvedValue({ ...firstEra, created: false });

    const { result } = await service.importEras();

    expect(result).toBe(CANNED_RESULT);
  });
});
