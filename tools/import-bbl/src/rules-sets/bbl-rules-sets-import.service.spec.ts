import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NameExternalIdService,
  RulesSetsImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { type EraConfig, EraConfigService } from '../eras/era-config.service';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { BblRulesSetsImportService } from './bbl-rules-sets-import.service';

interface Mocks {
  eraConfig: MockProxy<EraConfigService>;
  rulesSetsImport: MockProxy<RulesSetsImportService>;
  bootstrap: MockProxy<ExternalSystemBootstrapService>;
  nameConfig: MockProxy<ExternalSystemNameConfigService>;
}

/**
 * The full upsertRulesSet result record (RulesSetsImportService.upsertRulesSet
 * resolves the API's RulesSet + created shape). Only `id` varies across these
 * tests; the rest are filled with unremarkable defaults.
 */
function makeRulesSetRecord(id: number) {
  return {
    id,
    name: 'RulesSet',
    createdAt: new Date('2026-01-01'),
    created: true,
  };
}

/**
 * Builds the service under test through a TestingModule with every
 * collaborator mocked. Deterministic collaborators (name resolution, error
 * building) mirror the real production logic so a regression in the service
 * under test still fails these tests.
 */
async function makeService(): Promise<{
  service: BblRulesSetsImportService;
  mocks: Mocks;
}> {
  const eraConfig = mock<EraConfigService>();

  const rulesSetsImport = mock<RulesSetsImportService>();

  const bootstrap = mock<ExternalSystemBootstrapService>();
  bootstrap.bootstrap.mockResolvedValue({ ok: true, ids: [1, 2] });

  const nameConfig = mock<ExternalSystemNameConfigService>();
  nameConfig.getBblSystemName.mockReturnValue('BBL');

  const nameExternalId = mock<NameExternalIdService>();
  nameExternalId.forRulesSet.mockImplementation((name) => name);

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
      BblRulesSetsImportService,
      { provide: EraConfigService, useValue: eraConfig },
      { provide: RulesSetsImportService, useValue: rulesSetsImport },
      { provide: ExternalSystemBootstrapService, useValue: bootstrap },
      { provide: ExternalSystemNameConfigService, useValue: nameConfig },
      { provide: NameExternalIdService, useValue: nameExternalId },
      { provide: ImportResultService, useValue: importResults },
    ],
  }).compile();

  return {
    service: moduleRef.get(BblRulesSetsImportService),
    mocks: { eraConfig, rulesSetsImport, bootstrap, nameConfig },
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
  it('upserts each distinct rules set once with its name under BBL and Name', async () => {
    const { service, mocks } = await makeService();
    mocks.eraConfig.getEras.mockReturnValue(twoErasSharingNothing);
    mocks.rulesSetsImport.upsertRulesSet
      .mockResolvedValueOnce(makeRulesSetRecord(100))
      .mockResolvedValueOnce(makeRulesSetRecord(200));

    const { result, rulesSetIdsByName } = await service.importRulesSets();

    expect(result.imported).toBe(2);
    expect(result.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.bootstrap.bootstrap).toHaveBeenCalledWith([
      { name: 'BBL', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.rulesSetsImport.upsertRulesSet).toHaveBeenCalledTimes(2);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.rulesSetsImport.upsertRulesSet).toHaveBeenNthCalledWith(
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
    expect(rulesSetIdsByName.get('Living rulebook')).toBe(100);
    expect(rulesSetIdsByName.get('BB2020')).toBe(200);
  });

  it('dedupes a rules set shared by multiple eras, upserting it once', async () => {
    const { service, mocks } = await makeService();
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
    mocks.rulesSetsImport.upsertRulesSet.mockResolvedValue(
      makeRulesSetRecord(200),
    );

    const { result, rulesSetIdsByName } = await service.importRulesSets();

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.rulesSetsImport.upsertRulesSet).toHaveBeenCalledTimes(1);
    expect(result.imported).toBe(1);
    expect(rulesSetIdsByName.get('BB2020')).toBe(200);
  });

  it('imports the distinct rules-set names across all eras (flattened)', async () => {
    const { service, mocks } = await makeService();
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
    mocks.rulesSetsImport.upsertRulesSet
      .mockResolvedValueOnce(makeRulesSetRecord(10))
      .mockResolvedValueOnce(makeRulesSetRecord(20))
      .mockResolvedValueOnce(makeRulesSetRecord(30));

    const outcome = await service.importRulesSets();

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.bootstrap.bootstrap).toHaveBeenCalledWith([
      { name: 'BBL', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.rulesSetsImport.upsertRulesSet).toHaveBeenCalledTimes(3);
    const upsertedNames = mocks.rulesSetsImport.upsertRulesSet.mock.calls.map(
      (c) => (c[0] as { name: string }).name,
    );
    expect(new Set(upsertedNames)).toEqual(new Set(['CRP', 'CRP+', 'BB2016']));
    expect(
      mocks.rulesSetsImport.upsertRulesSet.mock.calls.every(
        (c) => !('races' in (c[0] as Record<string, unknown>)),
      ),
    ).toBe(true);
    expect('rulesSetsByName' in outcome).toBe(false);
    expect(outcome.result.imported).toBe(3);
  });

  it('records an error and maps no id when a rules set upsert fails', async () => {
    const { service, mocks } = await makeService();
    mocks.eraConfig.getEras.mockReturnValue([
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
      },
    ]);
    mocks.rulesSetsImport.upsertRulesSet.mockImplementation((_data, errors) => {
      errors.push({ item: {}, message: 'boom' });
      return Promise.resolve(undefined);
    });

    const { result, rulesSetIdsByName } = await service.importRulesSets();

    expect(result.imported).toBe(0);
    expect(result.success).toBe(false);
    expect(rulesSetIdsByName.has('BB2020')).toBe(false);
  });

  it('records one error and imports nothing when BBL_ERAS is unset', async () => {
    const { service, mocks } = await makeService();
    mocks.eraConfig.getEras.mockImplementation(() => {
      throw new Error('BBL_ERAS is not set.');
    });

    const { result } = await service.importRulesSets();

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('BBL_ERAS'))).toBe(
      true,
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.rulesSetsImport.upsertRulesSet).not.toHaveBeenCalled();
  });

  it('records one error and imports nothing when an external system upsert fails', async () => {
    const { service, mocks } = await makeService();
    mocks.eraConfig.getEras.mockReturnValue(twoErasSharingNothing);
    mocks.bootstrap.bootstrap.mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['BBL', 'Name'] },
        message: 'network timeout',
      },
    });

    const { result } = await service.importRulesSets();

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    // Message is passed through unchanged (this caller adds no prefix): the
    // assertion now fails if production stops surfacing the real error text.
    expect(result.errors[0].message).toBe('network timeout');
    // And the error names the external systems the bootstrap tried to upsert.
    expect(result.errors[0].item).toEqual({
      externalSystems: ['BBL', 'Name'],
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.rulesSetsImport.upsertRulesSet).not.toHaveBeenCalled();
  });
});
