import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  PositionRulesSetsImportService,
} from '@blood-bowl-tracker/import';
import type { TpPositionCharacteristics } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { TpPositionCharacteristicsImportService } from './tp-position-characteristics-import.service';

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

const RUNNER: TpPositionCharacteristics = {
  move: 6,
  strength: 3,
  agility: 3,
  passing: 4,
  armour: 9,
};
const SLAYER: TpPositionCharacteristics = {
  move: 5,
  strength: 3,
  agility: 4,
  passing: 0,
  armour: 9,
};

describe('TpPositionCharacteristicsImportService', () => {
  let service: TpPositionCharacteristicsImportService;
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
        TpPositionCharacteristicsImportService,
        {
          provide: PositionRulesSetsImportService,
          useValue: positionRulesSetsImport,
        },
        { provide: ImportResultService, useValue: importResults },
      ],
    }).compile();
    service = moduleRef.get(TpPositionCharacteristicsImportService);
  });

  it('sends one entry per rules set for a position, in a single call', async () => {
    await service.syncPositionCharacteristics(
      new Map([
        [
          70,
          new Map([
            [900, RUNNER],
            [901, SLAYER],
          ]),
        ],
      ]),
    );

    expect(positionRulesSetsImport.syncPositionRulesSets).toHaveBeenCalledTimes(
      1,
    );
    expect(positionRulesSetsImport.syncPositionRulesSets).toHaveBeenCalledWith(
      {
        entries: [
          {
            positionId: 70,
            rulesSetId: 900,
            move: 6,
            strength: 3,
            agility: 3,
            passing: 4,
            armour: 9,
          },
          {
            positionId: 70,
            rulesSetId: 901,
            move: 5,
            strength: 3,
            agility: 4,
            passing: 0,
            armour: 9,
          },
        ],
      },
      expect.any(Array),
    );
    expect(resultArgs(importResults).imported).toBe(2);
  });

  it('sends a separate call per position so one rejection cannot sink another', async () => {
    positionRulesSetsImport.syncPositionRulesSets
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ positionRulesSetIds: [1] });

    await service.syncPositionCharacteristics(
      new Map([
        [70, new Map([[900, RUNNER]])],
        [71, new Map([[900, SLAYER]])],
      ]),
    );

    expect(positionRulesSetsImport.syncPositionRulesSets).toHaveBeenCalledTimes(
      2,
    );
    expect(resultArgs(importResults).imported).toBe(1);
  });

  it('counts nothing imported when a position sync is rejected', async () => {
    positionRulesSetsImport.syncPositionRulesSets.mockResolvedValue(undefined);

    await service.syncPositionCharacteristics(
      new Map<number, Map<number, TpPositionCharacteristics>>([
        [70, new Map<number, TpPositionCharacteristics>([[900, RUNNER]])],
      ]),
    );

    // syncPositionRulesSets records its own ImportError into the array it was
    // handed; this service only decides not to count the rows.
    expect(resultArgs(importResults).imported).toBe(0);
  });

  it('skips a position with no rules sets left after conflict handling', async () => {
    await service.syncPositionCharacteristics(
      new Map<number, Map<number, TpPositionCharacteristics>>([
        [70, new Map<number, TpPositionCharacteristics>()],
      ]),
    );

    expect(
      positionRulesSetsImport.syncPositionRulesSets,
    ).not.toHaveBeenCalled();
    expect(resultArgs(importResults)).toEqual({ imported: 0, errors: [] });
  });

  it('does nothing at all for an empty map', async () => {
    await service.syncPositionCharacteristics(new Map());

    expect(
      positionRulesSetsImport.syncPositionRulesSets,
    ).not.toHaveBeenCalled();
  });

  it('returns the ImportResult the result service built', async () => {
    const outcome = await service.syncPositionCharacteristics(new Map());

    expect(outcome.result).toBe(CANNED_RESULT);
  });
});
