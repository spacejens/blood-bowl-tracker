import type { Era } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  BBL_EXTERNAL_SYSTEM_NAME,
  ExternalSystemBootstrapService,
  ImportResultService,
  NameExternalIdService,
  RulesSetsImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { era } from '../shared/curated-era.test-helpers';
import { BblRulesSetsImportService } from './bbl-rules-sets-import.service';

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
  rulesSetsImport: MockProxy<RulesSetsImportService>;
  bootstrap: MockProxy<ExternalSystemBootstrapService>;
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
    lastingInjuriesNeverHeal: false,
    createdAt: new Date('2026-01-01'),
    created: true,
  };
}

/** The curated eras the eras step hands over, keyed by configured name. */
function erasOf(...eras: Era[]): Map<string, Era> {
  return new Map(eras.map((e) => [e.name, e]));
}

/** The First era as batch 001 curates it: CRP, then CRP+, then BB2016. */
const firstEraOnly = erasOf(
  era({ name: 'First era', rulesSetNames: ['CRP', 'CRP+', 'BB2016'] }),
);

describe('BblRulesSetsImportService', () => {
  let service: BblRulesSetsImportService;
  let mocks: Mocks;

  beforeEach(async () => {
    const rulesSetsImport = mock<RulesSetsImportService>();

    const bootstrap = mock<ExternalSystemBootstrapService>();
    bootstrap.bootstrap.mockResolvedValue({ ok: true, ids: [1, 2] });

    const nameExternalId = mock<NameExternalIdService>();
    // `forRulesSet` is a pure identity passthrough with no branching or
    // formatting, so there is no algorithm here that can drift out of sync with
    // the real NameExternalIdService — exempt from the canned-response rule.
    nameExternalId.forRulesSet.mockImplementation((name) => name);

    const importResults = mock<ImportResultService>();
    importResults.result.mockReturnValue(CANNED_RESULT);

    const moduleRef = await Test.createTestingModule({
      providers: [
        BblRulesSetsImportService,
        { provide: RulesSetsImportService, useValue: rulesSetsImport },
        { provide: ExternalSystemBootstrapService, useValue: bootstrap },
        { provide: NameExternalIdService, useValue: nameExternalId },
        { provide: ImportResultService, useValue: importResults },
      ],
    }).compile();

    service = moduleRef.get(BblRulesSetsImportService);
    mocks = { rulesSetsImport, bootstrap, importResults };
  });

  it("attaches the BBL id to each of the eras' curated rules sets, found by its Name id", async () => {
    mocks.rulesSetsImport.upsert
      .mockResolvedValueOnce(makeRulesSetRecord(10))
      .mockResolvedValueOnce(makeRulesSetRecord(20))
      .mockResolvedValueOnce(makeRulesSetRecord(30));

    await service.importRulesSets(firstEraOnly);

    expect(mocks.bootstrap.bootstrap).toHaveBeenCalledWith([
      { name: BBL_EXTERNAL_SYSTEM_NAME, category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
    expect(mocks.rulesSetsImport.upsert.mock.calls.map((c) => c[0])).toEqual(
      ['CRP', 'CRP+', 'BB2016'].map((name) => ({
        externalIds: [
          { externalSystemId: 2, externalId: name },
          { externalSystemId: 1, externalId: name },
        ],
      })),
    );
    expect(resultArgs(mocks.importResults)).toEqual({
      imported: 3,
      errors: [],
    });
  });

  it('upserts a rules set shared by several eras once, in first-seen order', async () => {
    mocks.rulesSetsImport.upsert.mockResolvedValue(makeRulesSetRecord(1));

    await service.importRulesSets(
      erasOf(
        era({ name: 'First era', rulesSetNames: ['CRP', 'CRP+', 'BB2016'] }),
        era({ name: 'GBBL 1', rulesSetNames: ['BB2016'] }),
        era({ name: 'Second era', rulesSetNames: ['BB2020'] }),
        era({ name: 'Third era', rulesSetNames: ['BB2020'] }),
      ),
    );

    expect(
      mocks.rulesSetsImport.upsert.mock.calls.map(
        (c) => c[0].externalIds[0].externalId,
      ),
    ).toEqual(['CRP', 'CRP+', 'BB2016', 'BB2020']);
  });

  it('upserts nothing when no era was imported', async () => {
    await service.importRulesSets(new Map());

    expect(mocks.rulesSetsImport.upsert).not.toHaveBeenCalled();
    expect(resultArgs(mocks.importResults)).toEqual({
      imported: 0,
      errors: [],
    });
  });

  it('leaves a rules set whose upsert fails out of the map, keeping only its upsert error', async () => {
    const missingField = {
      item: { externalIds: [] },
      message: 'Failed to import rules set: name is required',
    };
    mocks.rulesSetsImport.upsert
      .mockImplementationOnce((_data, errors) => {
        errors.push(missingField);
        return Promise.resolve(undefined);
      })
      .mockResolvedValue(makeRulesSetRecord(20));

    const outcome = await service.importRulesSets(firstEraOnly);

    expect([...outcome.rulesSetsByName.keys()]).toEqual(['CRP+', 'BB2016']);
    expect(resultArgs(mocks.importResults)).toEqual({
      imported: 2,
      errors: [missingField],
    });
  });

  it('records one error and imports nothing when an external system upsert fails', async () => {
    mocks.bootstrap.bootstrap.mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: [BBL_EXTERNAL_SYSTEM_NAME, 'Name'] },
        message: 'network timeout',
      },
    });

    const outcome = await service.importRulesSets(firstEraOnly);

    const { errors } = resultArgs(mocks.importResults);
    expect(errors).toHaveLength(1);
    // Message is passed through unchanged (this caller adds no prefix): the
    // exact match fails if production stops surfacing the real error text.
    expect(errors[0].message).toBe('network timeout');
    // And the error names the external systems the bootstrap tried to upsert.
    expect(errors[0].item).toEqual({
      externalSystems: [BBL_EXTERNAL_SYSTEM_NAME, 'Name'],
    });
    expect(mocks.rulesSetsImport.upsert).not.toHaveBeenCalled();
    expect(outcome.rulesSetsByName.size).toBe(0);
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    mocks.rulesSetsImport.upsert.mockResolvedValue(makeRulesSetRecord(100));

    const { result } = await service.importRulesSets(firstEraOnly);

    expect(result).toBe(CANNED_RESULT);
  });

  it('returns each upserted rules set keyed by name, carrying its curated formats', async () => {
    mocks.rulesSetsImport.upsert
      .mockResolvedValueOnce({
        ...makeRulesSetRecord(10),
        name: 'CRP',
        passingFormat: 'absent' as const,
      })
      .mockResolvedValueOnce({
        ...makeRulesSetRecord(20),
        name: 'BB2020',
        passingFormat: 'plus' as const,
      });

    const outcome = await service.importRulesSets(
      erasOf(era({ name: 'First era', rulesSetNames: ['CRP', 'BB2020'] })),
    );

    expect(outcome.rulesSetsByName.get('CRP')?.id).toBe(10);
    expect(outcome.rulesSetsByName.get('CRP')?.passingFormat).toBe('absent');
    expect(outcome.rulesSetsByName.get('BB2020')?.id).toBe(20);
    expect(outcome.rulesSetsByName.get('BB2020')?.passingFormat).toBe('plus');
  });
});
