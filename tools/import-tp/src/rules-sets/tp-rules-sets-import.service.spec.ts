import type { Era } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NameExternalIdService,
  RulesSetsImportService,
  TP_EXTERNAL_SYSTEM_NAME,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import {
  asProviderMethod,
  curatedEra,
  mockImportResultService,
} from '../import-package.test-helpers';
import { TpRulesSetsImportService } from './tp-rules-sets-import.service';

interface MakeServiceOptions {
  bootstrap: ReturnType<typeof vi.fn>;
  upsertRulesSet: ReturnType<typeof vi.fn>;
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
  bootstrap,
  upsertRulesSet,
}: MakeServiceOptions): Promise<{
  service: TpRulesSetsImportService;
  importResults: MockProxy<ImportResultService>;
}> {
  const rulesSetsImport = mock<RulesSetsImportService>();
  rulesSetsImport.upsert.mockImplementation(asProviderMethod(upsertRulesSet));
  const externalSystemBootstrap = mock<ExternalSystemBootstrapService>();
  externalSystemBootstrap.bootstrap.mockImplementation(
    asProviderMethod(bootstrap),
  );
  const nameExternalId = mock<NameExternalIdService>();
  // `forRulesSet` is a pure identity passthrough with no branching or
  // formatting, so there is no algorithm here that can drift out of sync with
  // the real NameExternalIdService — exempt from the canned-response rule.
  nameExternalId.forRulesSet.mockImplementation((name) => name);
  const importResults = mockImportResultService();
  // The shared helper's mockImportResultService() only provides the exempt
  // `error` identity mock; `result` is stubbed with a canned value here.
  // ImportResultService.result's own success derivation is covered by
  // packages/import-shared/src/import-result.service.spec.ts.
  importResults.result.mockReturnValue(CANNED_RESULT);

  const moduleRef = await Test.createTestingModule({
    providers: [
      TpRulesSetsImportService,
      { provide: RulesSetsImportService, useValue: rulesSetsImport },
      {
        provide: ExternalSystemBootstrapService,
        useValue: externalSystemBootstrap,
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

/** Curated eras as the eras step returns them, keyed by configured name. */
const erasByName = new Map<string, Era>([
  ['Third era', curatedEra({ name: 'Third era', rulesSetNames: ['LRB6'] })],
  [
    'Fourth era',
    curatedEra({ name: 'Fourth era', rulesSetNames: ['BB2020', 'LRB6'] }),
  ],
]);

describe('TpRulesSetsImportService', () => {
  it('attaches the TP id to each distinct curated rules set, found by its Name id', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertRulesSet = vi
      .fn()
      .mockResolvedValueOnce({ id: 100, name: 'LRB6' })
      .mockResolvedValueOnce({ id: 200, name: 'BB2020' });
    const { service, importResults } = await makeService({
      bootstrap,
      upsertRulesSet,
    });

    await service.importRulesSets(erasByName);

    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(2);
    expect(errors).toEqual([]);
    expect(bootstrap).toHaveBeenCalledWith([
      { name: TP_EXTERNAL_SYSTEM_NAME, category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
    // Distinct across the curated eras, first-seen order: LRB6 then BB2020.
    expect(upsertRulesSet).toHaveBeenCalledTimes(2);
    expect(upsertRulesSet).toHaveBeenNthCalledWith(
      1,
      {
        externalIds: [
          { externalSystemId: 2, externalId: 'LRB6' },
          { externalSystemId: 1, externalId: 'LRB6' },
        ],
      },
      expect.any(Array),
    );
    expect(upsertRulesSet).toHaveBeenNthCalledWith(
      2,
      {
        externalIds: [
          { externalSystemId: 2, externalId: 'BB2020' },
          { externalSystemId: 1, externalId: 'BB2020' },
        ],
      },
      expect.any(Array),
    );
  });

  it('upserts nothing when no era was imported', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertRulesSet = vi.fn();
    const { service, importResults } = await makeService({
      bootstrap,
      upsertRulesSet,
    });

    const outcome = await service.importRulesSets(new Map());

    expect(resultArgs(importResults)).toEqual({ imported: 0, errors: [] });
    expect(upsertRulesSet).not.toHaveBeenCalled();
    expect(outcome.rulesSetsByName.size).toBe(0);
  });

  it('records one error and imports nothing when an external system upsert fails', async () => {
    const bootstrap = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: [TP_EXTERNAL_SYSTEM_NAME, 'Name'] },
        message: 'network timeout',
      },
    });
    const upsertRulesSet = vi.fn();
    const { service, importResults } = await makeService({
      bootstrap,
      upsertRulesSet,
    });

    await service.importRulesSets(erasByName);

    const { errors } = resultArgs(importResults);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('network timeout');
    expect(errors[0].item).toEqual({
      externalSystems: [TP_EXTERNAL_SYSTEM_NAME, 'Name'],
    });
    expect(upsertRulesSet).not.toHaveBeenCalled();
  });

  it('keeps only the upsert error for a rules set missing from the catalog, and imports the rest', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const missingField = {
      item: { externalIds: [] },
      message: 'Failed to import rules set "BB2020": name is required',
    };
    const upsertRulesSet = vi
      .fn()
      .mockResolvedValueOnce({ id: 100, name: 'LRB6' })
      .mockImplementationOnce((_data: unknown, errors: unknown[]) => {
        errors.push(missingField);
        return Promise.resolve(undefined);
      });
    const { service, importResults } = await makeService({
      bootstrap,
      upsertRulesSet,
    });

    const outcome = await service.importRulesSets(erasByName);

    expect(resultArgs(importResults)).toEqual({
      imported: 1,
      errors: [missingField],
    });
    expect([...outcome.rulesSetsByName.keys()]).toEqual(['LRB6']);
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertRulesSet = vi
      .fn()
      .mockResolvedValueOnce({ id: 100, name: 'LRB6' })
      .mockResolvedValueOnce({ id: 200, name: 'BB2020' });
    const { service } = await makeService({ bootstrap, upsertRulesSet });

    const { result } = await service.importRulesSets(erasByName);

    expect(result).toBe(CANNED_RESULT);
  });

  it('returns every upserted rules set by name, with its characteristic formats', async () => {
    // The players step needs the formats to know which direction of a
    // current-vs-template stat gap is a reduction rather than an advancement.
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertRulesSet = vi.fn().mockResolvedValue({
      id: 900,
      name: 'BB2020',
      moveFormat: 'bare',
      strengthFormat: 'bare',
      agilityFormat: 'plus',
      passingFormat: 'plus',
      armourFormat: 'plus',
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    const { service } = await makeService({ bootstrap, upsertRulesSet });

    const outcome = await service.importRulesSets(erasByName);

    expect(outcome.rulesSetsByName.get('BB2020')?.agilityFormat).toBe('plus');
    expect(outcome.rulesSetsByName.get('BB2020')?.id).toBe(900);
  });
});
