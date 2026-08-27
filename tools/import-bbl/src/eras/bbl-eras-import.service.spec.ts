import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ErasImportService,
  ExternalSystemBootstrapService,
  ImportResultService,
  NameExternalIdService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { BblErasImportService } from './bbl-eras-import.service';
import { type EraConfig, EraConfigService } from './era-config.service';

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

/** The numeric id the mocked bootstrap assigns to the BBL external system. */
const BBL_SYSTEM_ID = 1;

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
  nameConfig: MockProxy<ExternalSystemNameConfigService>;
  importResults: MockProxy<ImportResultService>;
  lookup: MockProxy<ReferenceLookupService>;
}

/**
 * The full upsert result record (ErasImportService.upsert resolves the
 * API's Era + created shape). Pass overrides for the fields each test cares
 * about; the rest are filled with unremarkable defaults.
 */
function makeEraRecord(overrides: { id: number; name: string }) {
  return {
    leagueId: 10,
    rulesSetIds: [100],
    startDate: '2011-09-09',
    endDate: null,
    createdAt: new Date('2026-01-01'),
    created: true,
    ...overrides,
  };
}

const eras: EraConfig[] = [
  {
    leagueName: 'tLoEG',
    identity: { name: 'Living rulebook', rulesSets: ['Living rulebook'] },
    dates: {
      startDate: '2011-09-09',
      endDate: '2021-09-01',
      autoAssignByDate: true,
    },
    players: { firstPlayerId: 1, autoAssignByPlayerId: true },
  },
  {
    leagueName: 'tLoEG',
    identity: { name: 'BB2020', rulesSets: ['BB2020'] },
    dates: { startDate: '2021-09-01', autoAssignByDate: true },
    players: { firstPlayerId: 5001, autoAssignByPlayerId: true },
  },
];

const oneEra: EraConfig[] = [
  {
    leagueName: 'My League',
    identity: { name: 'Era One', rulesSets: ['CRP'] },
    dates: { startDate: '2011-09-09', autoAssignByDate: true },
    players: { firstPlayerId: 1, autoAssignByPlayerId: true },
  },
];

describe('BblErasImportService', () => {
  let service: BblErasImportService;
  let mocks: Mocks;

  /**
   * Builds the service under test through a TestingModule with every
   * collaborator mocked. Deterministic collaborators (name resolution, error
   * building, key derivation) mirror the real production logic so a regression
   * in the service under test still fails these tests.
   */
  beforeEach(async () => {
    const eraConfig = mock<EraConfigService>();

    const erasImport = mock<ErasImportService>();

    const bootstrap = mock<ExternalSystemBootstrapService>();
    bootstrap.bootstrap.mockResolvedValue({ ok: true, ids: [1, 2] });

    const nameConfig = mock<ExternalSystemNameConfigService>();
    nameConfig.getBblSystemName.mockReturnValue('BBL');

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

    const lookup = mock<ReferenceLookupService>();
    // `keyOf` is a pure, deterministic key derivation with no branching that
    // could drift from ReferenceLookupService's own real implementation --
    // exempt from the canned-response rule, same as the other passthroughs.
    lookup.keyOf.mockImplementation(
      (ref) => `${ref.externalSystemId}\t${ref.externalId}`,
    );
    lookup.lookupMap.mockImplementation((kind) =>
      Promise.resolve(
        kind === 'league'
          ? new Map([[`${BBL_SYSTEM_ID}\tMy League`, 11]])
          : new Map([[`${BBL_SYSTEM_ID}\tCRP`, 22]]),
      ),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        BblErasImportService,
        { provide: EraConfigService, useValue: eraConfig },
        { provide: ErasImportService, useValue: erasImport },
        { provide: ExternalSystemBootstrapService, useValue: bootstrap },
        { provide: ExternalSystemNameConfigService, useValue: nameConfig },
        { provide: NameExternalIdService, useValue: nameExternalId },
        { provide: ImportResultService, useValue: importResults },
        { provide: ReferenceLookupService, useValue: lookup },
      ],
    }).compile();

    service = moduleRef.get(BblErasImportService);
    mocks = {
      eraConfig,
      erasImport,
      bootstrap,
      nameConfig,
      importResults,
      lookup,
    };
  });

  it("resolves each era's league and rules sets through the api", async () => {
    mocks.eraConfig.getEras.mockReturnValue(oneEra);
    mocks.erasImport.upsert.mockResolvedValue(
      makeEraRecord({ id: 500, name: 'Era One' }),
    );

    await service.importEras();

    expect(mocks.lookup.lookupMap).toHaveBeenCalledWith('league', [
      { externalSystemId: BBL_SYSTEM_ID, externalId: 'My League' },
    ]);
    expect(mocks.lookup.lookupMap).toHaveBeenCalledWith('rulesSet', [
      { externalSystemId: BBL_SYSTEM_ID, externalId: 'CRP' },
    ]);
    expect(mocks.lookup.lookupMap).toHaveBeenCalledTimes(2);
    expect(resultArgs(mocks.importResults).errors).toEqual([]);
  });

  it('upserts each era referencing the resolved league id and rules set ids', async () => {
    mocks.eraConfig.getEras.mockReturnValue(oneEra);
    mocks.erasImport.upsert.mockResolvedValue(
      makeEraRecord({ id: 500, name: 'Era One' }),
    );

    await service.importEras();

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(mocks.erasImport.upsert).toHaveBeenCalledWith(
      {
        name: 'Era One',
        leagueId: 11,
        rulesSetIds: [22],
        startDate: '2011-09-09',
        endDate: undefined,
        externalIds: [
          { externalSystemId: 1, externalId: 'Era One' },
          { externalSystemId: 2, externalId: 'Era One' },
        ],
      },
      expect.any(Array),
    );
  });

  it('calls lookupMap once per kind even with several eras sharing a league', async () => {
    mocks.eraConfig.getEras.mockReturnValue([
      ...oneEra,
      {
        leagueName: 'My League',
        identity: { name: 'Era Two', rulesSets: ['CRP'] },
        dates: { startDate: '2016-01-01', autoAssignByDate: true },
        players: { firstPlayerId: 5001, autoAssignByPlayerId: true },
      },
    ]);
    mocks.erasImport.upsert.mockResolvedValue(
      makeEraRecord({ id: 1, name: 'x' }),
    );

    await service.importEras();

    expect(mocks.lookup.lookupMap).toHaveBeenCalledTimes(2);
  });

  it('records an error and skips an era whose league does not resolve', async () => {
    mocks.eraConfig.getEras.mockReturnValue(oneEra);
    mocks.lookup.lookupMap.mockResolvedValue(new Map());

    await service.importEras();

    expect(resultArgs(mocks.importResults).errors[0].message).toContain(
      'could not be resolved',
    );
    expect(mocks.erasImport.upsert).not.toHaveBeenCalled();
  });

  it('records an error and skips an era whose league name is unset', async () => {
    mocks.eraConfig.getEras.mockReturnValue([
      {
        identity: { name: 'No League Era', rulesSets: ['CRP'] },
        dates: { startDate: '2011-09-09', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
      },
    ]);

    await service.importEras();

    const { errors } = resultArgs(mocks.importResults);
    expect(
      errors.some(
        (e) => e.message.includes('(unset)') && e.message.includes('league'),
      ),
    ).toBe(true);
    expect(mocks.erasImport.upsert).not.toHaveBeenCalled();
  });

  it('records an error and skips an era whose rules set does not resolve', async () => {
    mocks.eraConfig.getEras.mockReturnValue(oneEra);
    mocks.lookup.lookupMap.mockImplementation((kind) =>
      Promise.resolve(
        kind === 'league'
          ? new Map([[`${BBL_SYSTEM_ID}\tMy League`, 11]])
          : new Map<string, number>(),
      ),
    );

    await service.importEras();

    expect(resultArgs(mocks.importResults).errors[0].message).toContain(
      'could not be resolved',
    );
    expect(mocks.erasImport.upsert).not.toHaveBeenCalled();
  });

  it('resolves all rules-set names to ids and passes the array', async () => {
    mocks.eraConfig.getEras.mockReturnValue([
      {
        leagueName: 'My League',
        identity: { name: 'CRP era', rulesSets: ['CRP', 'CRP+'] },
        dates: { startDate: '2016-01-01', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
      },
    ]);
    mocks.lookup.lookupMap.mockImplementation((kind) =>
      Promise.resolve(
        kind === 'league'
          ? new Map([[`${BBL_SYSTEM_ID}\tMy League`, 11]])
          : new Map([
              [`${BBL_SYSTEM_ID}\tCRP`, 20],
              [`${BBL_SYSTEM_ID}\tCRP+`, 21],
            ]),
      ),
    );
    mocks.erasImport.upsert.mockResolvedValue(
      makeEraRecord({ id: 1, name: 'CRP era' }),
    );

    await service.importEras();

    expect(mocks.erasImport.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ rulesSetIds: [20, 21] }),
      expect.anything(),
    );
  });

  it('records an error when an era upsert fails', async () => {
    mocks.eraConfig.getEras.mockReturnValue(oneEra);
    mocks.erasImport.upsert.mockImplementation((_data, errors) => {
      errors.push({ item: {}, message: 'era boom' });
      return Promise.resolve(undefined);
    });

    await service.importEras();

    expect(resultArgs(mocks.importResults).imported).toBe(0);
  });

  it('records one error and imports nothing when BBL_ERAS is unset', async () => {
    mocks.eraConfig.getEras.mockImplementation(() => {
      throw new Error('BBL_ERAS is not set.');
    });

    await service.importEras();

    expect(
      resultArgs(mocks.importResults).errors.some((e) =>
        e.message.includes('BBL_ERAS'),
      ),
    ).toBe(true);
    expect(mocks.erasImport.upsert).not.toHaveBeenCalled();
    expect(mocks.lookup.lookupMap).not.toHaveBeenCalled();
  });

  it('records one error and imports nothing when an external system upsert fails', async () => {
    mocks.eraConfig.getEras.mockReturnValue(eras);
    mocks.bootstrap.bootstrap.mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['BBL', 'Name'] },
        message: 'network timeout',
      },
    });

    await service.importEras();

    const { errors } = resultArgs(mocks.importResults);
    expect(errors).toHaveLength(1);
    // Message is passed through unchanged (this caller adds no prefix): the
    // assertion now fails if production stops surfacing the real error text.
    expect(errors[0].message).toBe('network timeout');
    // And the error names the external systems the bootstrap tried to upsert.
    expect(errors[0].item).toEqual({
      externalSystems: ['BBL', 'Name'],
    });
    expect(mocks.erasImport.upsert).not.toHaveBeenCalled();
    expect(mocks.lookup.lookupMap).not.toHaveBeenCalled();
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    mocks.eraConfig.getEras.mockReturnValue(oneEra);
    mocks.erasImport.upsert.mockResolvedValue(
      makeEraRecord({ id: 500, name: 'Era One' }),
    );

    const { result } = await service.importEras();

    expect(result).toBe(CANNED_RESULT);
  });
});
