import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ErasImportService,
  ExternalSystemBootstrapService,
  ImportResultService,
  NameExternalIdService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
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
}

/**
 * The full upsertEra result record (ErasImportService.upsertEra resolves the
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

/**
 * Builds the service under test through a TestingModule with every
 * collaborator mocked. Deterministic collaborators (name resolution, error
 * building) mirror the real production logic so a regression in the service
 * under test still fails these tests.
 */
async function makeService(): Promise<{
  service: BblErasImportService;
  mocks: Mocks;
}> {
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

  const moduleRef = await Test.createTestingModule({
    providers: [
      BblErasImportService,
      { provide: EraConfigService, useValue: eraConfig },
      { provide: ErasImportService, useValue: erasImport },
      { provide: ExternalSystemBootstrapService, useValue: bootstrap },
      { provide: ExternalSystemNameConfigService, useValue: nameConfig },
      { provide: NameExternalIdService, useValue: nameExternalId },
      { provide: ImportResultService, useValue: importResults },
    ],
  }).compile();

  return {
    service: moduleRef.get(BblErasImportService),
    mocks: { eraConfig, erasImport, bootstrap, nameConfig, importResults },
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

const rulesSetIds = new Map<string, number>([
  ['Living rulebook', 100],
  ['BB2020', 200],
]);

const leagueIds = new Map<string, number>([['tLoEG', 10]]);

describe('BblErasImportService', () => {
  it('upserts each era referencing the league id and its rules set id', async () => {
    const { service, mocks } = await makeService();
    mocks.eraConfig.getEras.mockReturnValue(eras);
    mocks.erasImport.upsertEra
      .mockResolvedValueOnce(
        makeEraRecord({ id: 500, name: 'Living rulebook' }),
      )
      .mockResolvedValueOnce(makeEraRecord({ id: 600, name: 'BB2020' }));

    const { eraIdsByName } = await service.importEras(leagueIds, rulesSetIds);

    expect(resultArgs(mocks.importResults).imported).toBe(2);
    expect(mocks.bootstrap.bootstrap).toHaveBeenCalledWith([
      { name: 'BBL', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
    expect(eraIdsByName).toEqual(
      new Map([
        ['Living rulebook', 500],
        ['BB2020', 600],
      ]),
    );
    expect(mocks.erasImport.upsertEra).toHaveBeenNthCalledWith(
      1,
      {
        name: 'Living rulebook',
        leagueId: 10,
        rulesSetIds: [100],
        startDate: '2011-09-09',
        endDate: '2021-09-01',
        externalIds: [
          { externalSystemId: 1, externalId: 'Living rulebook' },
          { externalSystemId: 2, externalId: 'Living rulebook' },
        ],
      },
      expect.any(Array),
    );
    expect(mocks.erasImport.upsertEra).toHaveBeenNthCalledWith(
      2,
      {
        name: 'BB2020',
        leagueId: 10,
        rulesSetIds: [200],
        startDate: '2021-09-01',
        endDate: undefined,
        externalIds: [
          { externalSystemId: 1, externalId: 'BB2020' },
          { externalSystemId: 2, externalId: 'BB2020' },
        ],
      },
      expect.any(Array),
    );
  });

  it("resolves each era's league id from the map by its stamped name", async () => {
    const { service, mocks } = await makeService();
    mocks.eraConfig.getEras.mockReturnValue(eras);
    mocks.erasImport.upsertEra.mockResolvedValue(
      makeEraRecord({ id: 500, name: 'x' }),
    );

    await service.importEras(leagueIds, rulesSetIds);

    expect(mocks.erasImport.upsertEra).toHaveBeenCalledWith(
      expect.objectContaining({ leagueId: 10 }),
      expect.anything(),
    );
  });

  it('records an error and skips an era whose league was not imported', async () => {
    const { service, mocks } = await makeService();
    const gbblEra: EraConfig[] = [
      {
        leagueName: 'GBBL',
        identity: { name: 'GBBL 1', rulesSets: ['BB2016'] },
        dates: {
          startDate: '2019-08-03',
          endDate: '2019-11-13',
          autoAssignByDate: false,
        },
        players: { autoAssignByPlayerId: false },
        teams: { teamCodeOverrides: ['fes2'] },
      },
    ];
    mocks.eraConfig.getEras.mockReturnValue(gbblEra);
    mocks.erasImport.upsertEra.mockResolvedValue(
      makeEraRecord({ id: 700, name: 'GBBL 1' }),
    );

    // leagueIds only has tLoEG, not GBBL.
    await service.importEras(leagueIds, new Map([['BB2016', 300]]));

    expect(mocks.erasImport.upsertEra).not.toHaveBeenCalled();
    const { errors } = resultArgs(mocks.importResults);
    expect(
      errors.some(
        (e) => e.message.includes('GBBL 1') && e.message.includes('league'),
      ),
    ).toBe(true);
  });

  it('skips an era whose rules set was not imported, recording an error', async () => {
    const { service, mocks } = await makeService();
    mocks.eraConfig.getEras.mockReturnValue(eras);
    mocks.erasImport.upsertEra.mockResolvedValue(
      makeEraRecord({ id: 1, name: 'x' }),
    );
    const partialIds = new Map<string, number>([['Living rulebook', 100]]);

    await service.importEras(leagueIds, partialIds);

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(1);
    expect(mocks.erasImport.upsertEra).toHaveBeenCalledTimes(1);
    expect(
      errors.some(
        (e) => e.message.includes('BB2020') && e.message.includes('rules set'),
      ),
    ).toBe(true);
  });

  it('records an error when an era upsert fails', async () => {
    const { service, mocks } = await makeService();
    mocks.eraConfig.getEras.mockReturnValue([eras[1]]);
    mocks.erasImport.upsertEra.mockImplementation((_data, errors) => {
      errors.push({ item: {}, message: 'era boom' });
      return Promise.resolve(undefined);
    });

    await service.importEras(leagueIds, rulesSetIds);

    expect(resultArgs(mocks.importResults).imported).toBe(0);
  });

  it('records an error and skips an era whose rules-set name does not resolve', async () => {
    const { service, mocks } = await makeService();
    const multiRulesSetEras: EraConfig[] = [
      {
        leagueName: 'tLoEG',
        identity: { name: 'CRP era', rulesSets: ['CRP', 'MISSING'] },
        dates: { startDate: '2016-01-01', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
      },
    ];
    mocks.eraConfig.getEras.mockReturnValue(multiRulesSetEras);

    await service.importEras(leagueIds, new Map([['CRP', 20]]));

    expect(mocks.erasImport.upsertEra).not.toHaveBeenCalled();
    expect(resultArgs(mocks.importResults).errors[0].message).toMatch(
      /MISSING/,
    );
  });

  it('resolves all rules-set names to ids and passes the array', async () => {
    const { service, mocks } = await makeService();
    const multiRulesSetEras: EraConfig[] = [
      {
        leagueName: 'tLoEG',
        identity: { name: 'CRP era', rulesSets: ['CRP', 'CRP+'] },
        dates: { startDate: '2016-01-01', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
      },
    ];
    mocks.eraConfig.getEras.mockReturnValue(multiRulesSetEras);
    mocks.erasImport.upsertEra.mockResolvedValue(
      makeEraRecord({ id: 1, name: 'CRP era' }),
    );

    await service.importEras(
      leagueIds,
      new Map([
        ['CRP', 20],
        ['CRP+', 21],
      ]),
    );

    expect(mocks.erasImport.upsertEra).toHaveBeenCalledWith(
      expect.objectContaining({ rulesSetIds: [20, 21] }),
      expect.anything(),
    );
  });

  it('records one error and imports nothing when BBL_ERAS is unset', async () => {
    const { service, mocks } = await makeService();
    mocks.eraConfig.getEras.mockImplementation(() => {
      throw new Error('BBL_ERAS is not set.');
    });

    await service.importEras(leagueIds, rulesSetIds);

    expect(
      resultArgs(mocks.importResults).errors.some((e) =>
        e.message.includes('BBL_ERAS'),
      ),
    ).toBe(true);
    expect(mocks.erasImport.upsertEra).not.toHaveBeenCalled();
  });

  it('records one error and imports nothing when an external system upsert fails', async () => {
    const { service, mocks } = await makeService();
    mocks.eraConfig.getEras.mockReturnValue(eras);
    mocks.bootstrap.bootstrap.mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['BBL', 'Name'] },
        message: 'network timeout',
      },
    });

    await service.importEras(leagueIds, rulesSetIds);

    const { errors } = resultArgs(mocks.importResults);
    expect(errors).toHaveLength(1);
    // Message is passed through unchanged (this caller adds no prefix): the
    // assertion now fails if production stops surfacing the real error text.
    expect(errors[0].message).toBe('network timeout');
    // And the error names the external systems the bootstrap tried to upsert.
    expect(errors[0].item).toEqual({
      externalSystems: ['BBL', 'Name'],
    });
    expect(mocks.erasImport.upsertEra).not.toHaveBeenCalled();
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const { service, mocks } = await makeService();
    mocks.eraConfig.getEras.mockReturnValue(eras);
    mocks.erasImport.upsertEra
      .mockResolvedValueOnce(
        makeEraRecord({ id: 500, name: 'Living rulebook' }),
      )
      .mockResolvedValueOnce(makeEraRecord({ id: 600, name: 'BB2020' }));

    const { result } = await service.importEras(leagueIds, rulesSetIds);

    expect(result).toBe(CANNED_RESULT);
  });
});
