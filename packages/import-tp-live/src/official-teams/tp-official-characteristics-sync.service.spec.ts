import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { PositionRulesSetsService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import { TpOfficialBatchSyncService } from './tp-official-batch-sync.service';
import { TpOfficialCharacteristicsSyncService } from './tp-official-characteristics-sync.service';
import {
  CHARACTERISTICS,
  officialTeamsContext,
  positionSlot,
  RULES_SET_ID,
} from './tp-official-teams.test-helpers';

const BLITZER = { positionId: 9, rulesSetId: RULES_SET_ID, ...CHARACTERISTICS };
const THROWER = {
  positionId: 12,
  rulesSetId: RULES_SET_ID,
  ...CHARACTERISTICS,
};

describe('TpOfficialCharacteristicsSyncService', () => {
  let service: TpOfficialCharacteristicsSyncService;
  let positionRulesSets: MockProxy<PositionRulesSetsService>;
  let errors: ImportError[];

  beforeEach(async () => {
    positionRulesSets = mock<PositionRulesSetsService>();
    positionRulesSets.sync.mockResolvedValue({ positionRulesSetIds: [1] });
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpOfficialCharacteristicsSyncService,
        TpOfficialBatchSyncService,
        TpUpsertRunnerService,
        { provide: PositionRulesSetsService, useValue: positionRulesSets },
      ],
    }).compile();
    service = moduleRef.get(TpOfficialCharacteristicsSyncService);
  });

  const syncTwo = () =>
    service.syncCharacteristics({
      slots: [
        positionSlot(),
        positionSlot({ positionId: 12, name: 'Thrower' }),
      ],
      context: officialTeamsContext(),
      errors,
    });

  it("writes every position's characteristics under the rules set in one call", async () => {
    const result = await syncTwo();

    expect(positionRulesSets.sync).toHaveBeenCalledTimes(1);
    expect(positionRulesSets.sync).toHaveBeenCalledWith({
      entries: [BLITZER, THROWER],
    });
    expect(result).toEqual({
      imported: 2,
      positionCharacteristics: [BLITZER, THROWER],
    });
    expect(errors).toEqual([]);
  });

  it('falls back to one call per position when the batch is rejected', async () => {
    positionRulesSets.sync.mockRejectedValueOnce(new Error('batch rejected'));

    const result = await syncTwo();

    expect(positionRulesSets.sync).toHaveBeenCalledTimes(3);
    expect(positionRulesSets.sync).toHaveBeenNthCalledWith(2, {
      entries: [BLITZER],
    });
    expect(positionRulesSets.sync).toHaveBeenNthCalledWith(3, {
      entries: [THROWER],
    });
    expect(result.imported).toBe(2);
    expect(errors).toEqual([]);
  });

  it("records a rejected position's write and still writes the others", async () => {
    positionRulesSets.sync
      .mockRejectedValueOnce(new Error('batch rejected'))
      .mockRejectedValueOnce(new Error('passing format mismatch'))
      .mockResolvedValueOnce({ positionRulesSetIds: [2] });

    const result = await syncTwo();

    expect(result.imported).toBe(1);
    expect(result.positionCharacteristics).toEqual([BLITZER, THROWER]);
    expect(errors).toEqual([
      {
        item: { positionId: 9, rulesSet: 'BB2020' },
        message:
          'Failed to write the characteristics of position "Blitzer" (BB2020): passing format mismatch',
      },
    ]);
  });

  it('makes no call for no positions', async () => {
    const result = await service.syncCharacteristics({
      slots: [],
      context: officialTeamsContext(),
      errors,
    });

    expect(positionRulesSets.sync).not.toHaveBeenCalled();
    expect(result).toEqual({ imported: 0, positionCharacteristics: [] });
  });
});
