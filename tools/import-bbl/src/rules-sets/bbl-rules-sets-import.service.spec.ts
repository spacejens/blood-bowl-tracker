import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NameExternalIdService,
  RulesSetsImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { type EraConfig, EraConfigService } from '../eras/era-config.service';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { BblRulesSetsImportService } from './bbl-rules-sets-import.service';

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
  rulesSetsImport: MockProxy<RulesSetsImportService>;
  bootstrap: MockProxy<ExternalSystemBootstrapService>;
  nameConfig: MockProxy<ExternalSystemNameConfigService>;
  importResults: MockProxy<ImportResultService>;
}

/**
 * The full upsert result record (RulesSetsImportService.upsert
 * resolves the API's RulesSet + created shape). Only `id` varies across these
 * tests; the rest are filled with unremarkable defaults.
 */
function makeRulesSetRecord(id: number) {
  return {
    id,
    name: 'RulesSet',
    moveFormat: 'bare' as const,
    strengthFormat: 'bare' as const,
    agilityFormat: 'bare' as const,
    passingFormat: 'bare' as const,
    armourFormat: 'bare' as const,
    createdAt: new Date('2026-01-01'),
    created: true,
  };
}

const twoErasSharingNothing: EraConfig[] = [
  {
    identity: {
      name: 'Living rulebook',
      rulesSets: ['Living rulebook'],
    },
    dates: {
      startDate: '2011-09-09',
      endDate: '2021-09-01',
      autoAssignByDate: true,
    },
    players: {
      firstPlayerId: 1,
      autoAssignByPlayerId: true,
    },
  },
  {
    identity: {
      name: 'BB2020',
      rulesSets: ['BB2020'],
    },
    dates: {
      startDate: '2021-09-01',
      autoAssignByDate: true,
    },
    players: {
      firstPlayerId: 5001,
      autoAssignByPlayerId: true,
    },
  },
];

describe('BblRulesSetsImportService', () => {
  let service: BblRulesSetsImportService;
  let mocks: Mocks;

  /**
   * Builds the service under test through a TestingModule with every
   * collaborator mocked. Deterministic collaborators (name resolution, error
   * building) mirror the real production logic so a regression in the service
   * under test still fails these tests.
   */
  beforeEach(async () => {
    const eraConfig = mock<EraConfigService>();

    const rulesSetsImport = mock<RulesSetsImportService>();

    const bootstrap = mock<ExternalSystemBootstrapService>();
    bootstrap.bootstrap.mockResolvedValue({ ok: true, ids: [1, 2] });

    const nameConfig = mock<ExternalSystemNameConfigService>();
    nameConfig.getBblSystemName.mockReturnValue('BBL');

    const nameExternalId = mock<NameExternalIdService>();
    // `forRulesSet` is a pure identity passthrough with no branching or
    // formatting, so there is no algorithm here that can drift out of sync with
    // the real NameExternalIdService — exempt from the canned-response rule.
    nameExternalId.forRulesSet.mockImplementation((name) => name);

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
        BblRulesSetsImportService,
        { provide: EraConfigService, useValue: eraConfig },
        { provide: RulesSetsImportService, useValue: rulesSetsImport },
        { provide: ExternalSystemBootstrapService, useValue: bootstrap },
        { provide: ExternalSystemNameConfigService, useValue: nameConfig },
        { provide: NameExternalIdService, useValue: nameExternalId },
        { provide: ImportResultService, useValue: importResults },
      ],
    }).compile();

    service = moduleRef.get(BblRulesSetsImportService);
    mocks = {
      eraConfig,
      rulesSetsImport,
      bootstrap,
      nameConfig,
      importResults,
    };
  });

  it('upserts each distinct rules set once with its name under BBL and Name', async () => {
    mocks.eraConfig.getEras.mockReturnValue(twoErasSharingNothing);
    mocks.rulesSetsImport.upsert
      .mockResolvedValueOnce(makeRulesSetRecord(100))
      .mockResolvedValueOnce(makeRulesSetRecord(200));

    await service.importRulesSets();

    expect(resultArgs(mocks.importResults).imported).toBe(2);
    expect(mocks.bootstrap.bootstrap).toHaveBeenCalledWith([
      { name: 'BBL', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
    expect(mocks.rulesSetsImport.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.rulesSetsImport.upsert).toHaveBeenNthCalledWith(
      1,
      {
        name: 'Living rulebook',
        externalIds: [
          { externalSystemId: 1, externalId: 'Living rulebook' },
          { externalSystemId: 2, externalId: 'Living rulebook' },
        ],
      },
      expect.any(Array),
    );
  });

  it('dedupes a rules set shared by multiple eras, upserting it once', async () => {
    const eras: EraConfig[] = [
      {
        identity: { name: 'Era A', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
      },
      {
        identity: { name: 'Era B', rulesSets: ['BB2020'] },
        dates: { startDate: '2022-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 5001, autoAssignByPlayerId: true },
      },
    ];
    mocks.eraConfig.getEras.mockReturnValue(eras);
    mocks.rulesSetsImport.upsert.mockResolvedValue(makeRulesSetRecord(200));

    await service.importRulesSets();

    expect(mocks.rulesSetsImport.upsert).toHaveBeenCalledTimes(1);
    expect(resultArgs(mocks.importResults).imported).toBe(1);
  });

  it('imports the distinct rules-set names across all eras (flattened)', async () => {
    const eras: EraConfig[] = [
      {
        identity: { name: 'Era A', rulesSets: ['CRP', 'CRP+'] },
        dates: {
          startDate: '2011-09-09',
          endDate: '2021-09-01',
          autoAssignByDate: true,
        },
        players: {
          firstPlayerId: 1,
          lastPlayerId: 5000,
          autoAssignByPlayerId: true,
        },
      },
      {
        identity: { name: 'Era B', rulesSets: ['CRP+', 'BB2016'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 5001, autoAssignByPlayerId: true },
      },
    ];
    mocks.eraConfig.getEras.mockReturnValue(eras);
    mocks.rulesSetsImport.upsert
      .mockResolvedValueOnce(makeRulesSetRecord(10))
      .mockResolvedValueOnce(makeRulesSetRecord(20))
      .mockResolvedValueOnce(makeRulesSetRecord(30));

    const outcome = await service.importRulesSets();

    expect(mocks.bootstrap.bootstrap).toHaveBeenCalledWith([
      { name: 'BBL', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
    expect(mocks.rulesSetsImport.upsert).toHaveBeenCalledTimes(3);
    const upsertedNames = mocks.rulesSetsImport.upsert.mock.calls.map(
      (c) => (c[0] as { name: string }).name,
    );
    expect(new Set(upsertedNames)).toEqual(new Set(['CRP', 'CRP+', 'BB2016']));
    expect(
      mocks.rulesSetsImport.upsert.mock.calls.every(
        (c) => !('races' in (c[0] as Record<string, unknown>)),
      ),
    ).toBe(true);
    expect('rulesSetsByName' in outcome).toBe(false);
    expect(resultArgs(mocks.importResults).imported).toBe(3);
  });

  it('records an error and maps no id when a rules set upsert fails', async () => {
    mocks.eraConfig.getEras.mockReturnValue([
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
      },
    ]);
    mocks.rulesSetsImport.upsert.mockImplementation((_data, errors) => {
      errors.push({ item: {}, message: 'boom' });
      return Promise.resolve(undefined);
    });

    await service.importRulesSets();

    expect(resultArgs(mocks.importResults).imported).toBe(0);
  });

  it('records one error and imports nothing when BBL_ERAS is unset', async () => {
    mocks.eraConfig.getEras.mockImplementation(() => {
      throw new Error('BBL_ERAS is not set.');
    });

    await service.importRulesSets();

    expect(
      resultArgs(mocks.importResults).errors.some((e) =>
        e.message.includes('BBL_ERAS'),
      ),
    ).toBe(true);
    expect(mocks.rulesSetsImport.upsert).not.toHaveBeenCalled();
  });

  it('records one error and imports nothing when an external system upsert fails', async () => {
    mocks.eraConfig.getEras.mockReturnValue(twoErasSharingNothing);
    mocks.bootstrap.bootstrap.mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['BBL', 'Name'] },
        message: 'network timeout',
      },
    });

    await service.importRulesSets();

    const { errors } = resultArgs(mocks.importResults);
    expect(errors).toHaveLength(1);
    // Message is passed through unchanged (this caller adds no prefix): the
    // assertion now fails if production stops surfacing the real error text.
    expect(errors[0].message).toBe('network timeout');
    // And the error names the external systems the bootstrap tried to upsert.
    expect(errors[0].item).toEqual({
      externalSystems: ['BBL', 'Name'],
    });
    expect(mocks.rulesSetsImport.upsert).not.toHaveBeenCalled();
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    mocks.eraConfig.getEras.mockReturnValue(twoErasSharingNothing);
    mocks.rulesSetsImport.upsert
      .mockResolvedValueOnce(makeRulesSetRecord(100))
      .mockResolvedValueOnce(makeRulesSetRecord(200));

    const { result } = await service.importRulesSets();

    expect(result).toBe(CANNED_RESULT);
  });
});
