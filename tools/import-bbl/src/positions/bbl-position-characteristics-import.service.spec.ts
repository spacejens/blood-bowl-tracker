import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  PositionRulesSetsImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { BblPositionCharacteristicsImportService } from './bbl-position-characteristics-import.service';

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

function makeRulesSet(
  id: number,
  name: string,
  passingFormat: 'absent' | 'bare' | 'plus',
) {
  return {
    id,
    name,
    moveFormat: 'bare' as const,
    strengthFormat: 'bare' as const,
    agilityFormat: 'plus' as const,
    passingFormat,
    armourFormat: 'plus' as const,
    createdAt: new Date('2026-01-01'),
  };
}

const rulesSetsByName = new Map([
  ['CRP', makeRulesSet(10, 'CRP', 'absent')],
  ['BB2020', makeRulesSet(20, 'BB2020', 'plus')],
]);

describe('BblPositionCharacteristicsImportService', () => {
  let service: BblPositionCharacteristicsImportService;
  let positionRulesSetsImport: MockProxy<PositionRulesSetsImportService>;
  let importResults: MockProxy<ImportResultService>;

  beforeEach(async () => {
    positionRulesSetsImport = mock<PositionRulesSetsImportService>();
    positionRulesSetsImport.syncPositionRulesSets.mockResolvedValue({
      positionRulesSetIds: [1],
    });

    importResults = mock<ImportResultService>();
    importResults.result.mockReturnValue(CANNED_RESULT);

    const moduleRef = await Test.createTestingModule({
      providers: [
        BblPositionCharacteristicsImportService,
        {
          provide: PositionRulesSetsImportService,
          useValue: positionRulesSetsImport,
        },
        { provide: ImportResultService, useValue: importResults },
      ],
    }).compile();
    service = moduleRef.get(BblPositionCharacteristicsImportService);
  });

  it('syncs a real Passing value to a rules set that has Passing', async () => {
    await service.syncPositionCharacteristics({
      rulesSetIdsByPositionId: new Map([[100, new Set([20])]]),
      characteristicsByPositionId: new Map([
        [100, { move: 6, strength: 4, agility: 4, passing: 6, armour: 10 }],
      ]),
      rulesSetsByName,
    });

    expect(positionRulesSetsImport.syncPositionRulesSets).toHaveBeenCalledWith(
      {
        entries: [
          {
            positionId: 100,
            rulesSetId: 20,
            move: 6,
            strength: 4,
            agility: 4,
            passing: 6,
            armour: 10,
          },
        ],
      },
      expect.any(Array),
    );
  });

  it('syncs a dash Passing as 0 to a rules set that has Passing', async () => {
    await service.syncPositionCharacteristics({
      rulesSetIdsByPositionId: new Map([[100, new Set([20])]]),
      characteristicsByPositionId: new Map([
        [100, { move: 6, strength: 5, agility: 4, passing: null, armour: 10 }],
      ]),
      rulesSetsByName,
    });

    expect(
      positionRulesSetsImport.syncPositionRulesSets.mock.calls[0][0].entries[0]
        .passing,
    ).toBe(0);
  });

  it('syncs Passing as null to a rules set that has no Passing, whatever the page showed', async () => {
    await service.syncPositionCharacteristics({
      rulesSetIdsByPositionId: new Map([[100, new Set([10])]]),
      characteristicsByPositionId: new Map([
        [100, { move: 6, strength: 4, agility: 4, passing: 6, armour: 10 }],
      ]),
      rulesSetsByName,
    });

    expect(
      positionRulesSetsImport.syncPositionRulesSets.mock.calls[0][0].entries[0]
        .passing,
    ).toBeNull();
  });

  it('sends one call per position carrying an entry for every rules set', async () => {
    await service.syncPositionCharacteristics({
      rulesSetIdsByPositionId: new Map([[100, new Set([10, 20])]]),
      characteristicsByPositionId: new Map([
        [100, { move: 6, strength: 5, agility: 4, passing: null, armour: 10 }],
      ]),
      rulesSetsByName,
    });

    expect(positionRulesSetsImport.syncPositionRulesSets).toHaveBeenCalledTimes(
      1,
    );
    expect(
      positionRulesSetsImport.syncPositionRulesSets.mock.calls[0][0].entries,
    ).toEqual([
      {
        positionId: 100,
        rulesSetId: 10,
        move: 6,
        strength: 5,
        agility: 4,
        passing: null,
        armour: 10,
      },
      {
        positionId: 100,
        rulesSetId: 20,
        move: 6,
        strength: 5,
        agility: 4,
        passing: 0,
        armour: 10,
      },
    ]);
    expect(resultArgs(importResults).imported).toBe(2);
  });

  it('sends a separate call per position so one rejection cannot sink another', async () => {
    await service.syncPositionCharacteristics({
      rulesSetIdsByPositionId: new Map([
        [100, new Set([20])],
        [200, new Set([20])],
      ]),
      characteristicsByPositionId: new Map([
        [100, { move: 6, strength: 3, agility: 3, passing: 4, armour: 9 }],
        [200, { move: 5, strength: 3, agility: 3, passing: 4, armour: 8 }],
      ]),
      rulesSetsByName,
    });

    expect(positionRulesSetsImport.syncPositionRulesSets).toHaveBeenCalledTimes(
      2,
    );
  });

  it('skips a position whose characteristics never parsed, without a new error', async () => {
    await service.syncPositionCharacteristics({
      rulesSetIdsByPositionId: new Map([[100, new Set([20])]]),
      characteristicsByPositionId: new Map(),
      rulesSetsByName,
    });

    expect(
      positionRulesSetsImport.syncPositionRulesSets,
    ).not.toHaveBeenCalled();
    expect(resultArgs(importResults)).toEqual({ imported: 0, errors: [] });
  });

  it('counts nothing imported when a position sync is rejected', async () => {
    positionRulesSetsImport.syncPositionRulesSets.mockResolvedValue(undefined);

    await service.syncPositionCharacteristics({
      rulesSetIdsByPositionId: new Map([[100, new Set([20])]]),
      characteristicsByPositionId: new Map([
        [100, { move: 6, strength: 4, agility: 4, passing: 6, armour: 10 }],
      ]),
      rulesSetsByName,
    });

    // syncPositionRulesSets records its own ImportError into the array it was
    // handed; this service only decides not to count the rows.
    expect(resultArgs(importResults).imported).toBe(0);
  });

  it('skips a position mapped to an empty rules-set-id set', async () => {
    await service.syncPositionCharacteristics({
      rulesSetIdsByPositionId: new Map([[100, new Set()]]),
      characteristicsByPositionId: new Map([
        [100, { move: 6, strength: 4, agility: 4, passing: 6, armour: 10 }],
      ]),
      rulesSetsByName,
    });

    expect(
      positionRulesSetsImport.syncPositionRulesSets,
    ).not.toHaveBeenCalled();
    expect(resultArgs(importResults)).toEqual({ imported: 0, errors: [] });
  });

  it('returns the ImportResult the result service built', async () => {
    const outcome = await service.syncPositionCharacteristics({
      rulesSetIdsByPositionId: new Map(),
      characteristicsByPositionId: new Map(),
      rulesSetsByName,
    });

    expect(outcome.result).toBe(CANNED_RESULT);
  });
});
