import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NameExternalIdService,
  RulesSetsImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { EraDataConfig } from '../eras/era-data-config.service';
import { EraDataConfigService } from '../eras/era-data-config.service';
import {
  asProviderMethod,
  mockImportResultService,
} from '../import-package.test-helpers';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { TpRulesSetsImportService } from './tp-rules-sets-import.service';

interface MakeServiceOptions {
  getEras: () => EraDataConfig[];
  bootstrap: ReturnType<typeof vi.fn>;
  upsertRulesSet: ReturnType<typeof vi.fn>;
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
  getEras,
  bootstrap,
  upsertRulesSet,
  getTpSystemName = () => 'TP',
}: MakeServiceOptions): Promise<{
  service: TpRulesSetsImportService;
  importResults: MockProxy<ImportResultService>;
}> {
  const eraDataConfig = mock<EraDataConfigService>();
  eraDataConfig.getEras.mockImplementation(getEras);
  const rulesSetsImport = mock<RulesSetsImportService>();
  rulesSetsImport.upsertRulesSet.mockImplementation(
    asProviderMethod(upsertRulesSet),
  );
  const externalSystemBootstrap = mock<ExternalSystemBootstrapService>();
  externalSystemBootstrap.bootstrap.mockImplementation(
    asProviderMethod(bootstrap),
  );
  const externalSystemName = mock<ExternalSystemNameConfigService>();
  externalSystemName.getTpSystemName.mockImplementation(getTpSystemName);
  const nameExternalId = mock<NameExternalIdService>();
  // `forRulesSet` is a pure identity passthrough with no branching or
  // formatting, so there is no algorithm here that can drift out of sync with
  // the real NameExternalIdService — exempt from the canned-response rule.
  nameExternalId.forRulesSet.mockImplementation((name) => name);
  const importResults = mockImportResultService();
  // The shared helper's mockImportResultService() only provides the exempt
  // `error` identity mock; `result` is stubbed with a canned value here.
  // ImportResultService.result's own success derivation is covered by
  // packages/import/src/import-result.service.spec.ts.
  importResults.result.mockReturnValue(CANNED_RESULT);

  const moduleRef = await Test.createTestingModule({
    providers: [
      TpRulesSetsImportService,
      { provide: EraDataConfigService, useValue: eraDataConfig },
      { provide: RulesSetsImportService, useValue: rulesSetsImport },
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
    service: moduleRef.get(TpRulesSetsImportService),
    importResults,
  };
}

const eras: EraDataConfig[] = [
  {
    name: 'Third era',
    dataSubdir: 'third-era',
    rulesSets: ['LRB6'],
    startDate: '2013-01-01',
  },
  {
    name: 'Fourth era',
    dataSubdir: 'fourth-era',
    rulesSets: ['BB2020', 'LRB6'],
    startDate: '2020-11-28',
  },
];

describe('TpRulesSetsImportService', () => {
  it('upserts each distinct rules-set name and returns a name->id map', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertRulesSet = vi
      .fn()
      .mockResolvedValueOnce({ id: 100, name: 'LRB6' })
      .mockResolvedValueOnce({ id: 200, name: 'BB2020' });
    const { service, importResults } = await makeService({
      getEras: () => eras,
      bootstrap,
      upsertRulesSet,
    });

    const { rulesSetIdsByName } = await service.importRulesSets();

    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(2);
    expect(errors).toEqual([]);
    expect(bootstrap).toHaveBeenCalledWith([
      { name: 'TP', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
    // Distinct across eras, first-seen order: LRB6 then BB2020.
    expect(upsertRulesSet).toHaveBeenCalledTimes(2);
    expect(upsertRulesSet).toHaveBeenNthCalledWith(
      1,
      {
        name: 'LRB6',
        externalIds: [
          { externalSystemId: 1, externalId: 'LRB6' },
          { externalSystemId: 2, externalId: 'LRB6' },
        ],
      },
      expect.any(Array),
    );
    expect(rulesSetIdsByName).toEqual(
      new Map([
        ['LRB6', 100],
        ['BB2020', 200],
      ]),
    );
  });

  it('records one error and imports nothing when getEras() throws', async () => {
    const bootstrap = vi.fn();
    const upsertRulesSet = vi.fn();
    const { service, importResults } = await makeService({
      getEras: () => {
        throw new Error('TP_ERAS is not set.');
      },
      bootstrap,
      upsertRulesSet,
    });

    const { rulesSetIdsByName } = await service.importRulesSets();

    const { errors } = resultArgs(importResults);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('TP_ERAS is not set.');
    expect(errors[0].item).toEqual({ externalSystems: ['TP', 'Name'] });
    expect(rulesSetIdsByName.size).toBe(0);
    expect(bootstrap).not.toHaveBeenCalled();
    expect(upsertRulesSet).not.toHaveBeenCalled();
  });

  it('records one error and imports nothing when an external system upsert fails', async () => {
    const bootstrap = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['TP', 'Name'] },
        message: 'network timeout',
      },
    });
    const upsertRulesSet = vi.fn();
    const { service, importResults } = await makeService({
      getEras: () => eras,
      bootstrap,
      upsertRulesSet,
    });

    const { rulesSetIdsByName } = await service.importRulesSets();

    const { errors } = resultArgs(importResults);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('network timeout');
    expect(errors[0].item).toEqual({ externalSystems: ['TP', 'Name'] });
    expect(rulesSetIdsByName.size).toBe(0);
    expect(upsertRulesSet).not.toHaveBeenCalled();
  });

  it('omits a rules set from the map when its upsert fails', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertRulesSet = vi
      .fn()
      .mockResolvedValueOnce({ id: 100, name: 'LRB6' })
      .mockImplementationOnce(
        (_data: unknown, errors: { message: string }[]) => {
          errors.push({ message: 'rules set boom' });
          return Promise.resolve(undefined);
        },
      );
    const { service, importResults } = await makeService({
      getEras: () => eras,
      bootstrap,
      upsertRulesSet,
    });

    const { rulesSetIdsByName } = await service.importRulesSets();

    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(1);
    expect(errors).toHaveLength(1);
    expect(rulesSetIdsByName).toEqual(new Map([['LRB6', 100]]));
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertRulesSet = vi
      .fn()
      .mockResolvedValueOnce({ id: 100, name: 'LRB6' })
      .mockResolvedValueOnce({ id: 200, name: 'BB2020' });
    const { service } = await makeService({
      getEras: () => eras,
      bootstrap,
      upsertRulesSet,
    });

    const { result } = await service.importRulesSets();

    expect(result).toBe(CANNED_RESULT);
  });
});
