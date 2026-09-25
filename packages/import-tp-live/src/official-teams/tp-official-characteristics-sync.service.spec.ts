import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { PositionRulesSetsService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import { TpOfficialCharacteristicsSyncService } from './tp-official-characteristics-sync.service';
import {
  CHARACTERISTICS,
  officialTeamsContext,
  positionSlot,
  RULES_SET_ID,
} from './tp-official-teams.test-helpers';

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
        TpUpsertRunnerService,
        { provide: PositionRulesSetsService, useValue: positionRulesSets },
      ],
    }).compile();
    service = moduleRef.get(TpOfficialCharacteristicsSyncService);
  });

  it("writes each position's characteristics under the rules set, one call per position", async () => {
    const result = await service.syncCharacteristics({
      slots: [
        positionSlot(),
        positionSlot({ positionId: 12, name: 'Thrower' }),
      ],
      context: officialTeamsContext(),
      errors,
    });

    expect(positionRulesSets.sync).toHaveBeenNthCalledWith(1, {
      entries: [
        { positionId: 9, rulesSetId: RULES_SET_ID, ...CHARACTERISTICS },
      ],
    });
    expect(positionRulesSets.sync).toHaveBeenNthCalledWith(2, {
      entries: [
        { positionId: 12, rulesSetId: RULES_SET_ID, ...CHARACTERISTICS },
      ],
    });
    expect(result).toEqual({
      imported: 2,
      positionCharacteristics: [
        { positionId: 9, rulesSetId: RULES_SET_ID, ...CHARACTERISTICS },
        { positionId: 12, rulesSetId: RULES_SET_ID, ...CHARACTERISTICS },
      ],
    });
    expect(errors).toEqual([]);
  });

  it("records a rejected position's write and still writes the others", async () => {
    positionRulesSets.sync
      .mockRejectedValueOnce(new Error('passing format mismatch'))
      .mockResolvedValueOnce({ positionRulesSetIds: [2] });

    const result = await service.syncCharacteristics({
      slots: [
        positionSlot(),
        positionSlot({ positionId: 12, name: 'Thrower' }),
      ],
      context: officialTeamsContext(),
      errors,
    });

    expect(result.imported).toBe(1);
    expect(result.positionCharacteristics).toHaveLength(2);
    expect(errors).toEqual([
      {
        item: { positionId: 9, rulesSet: 'BB2020' },
        message:
          'Failed to write the characteristics of position "Blitzer" (BB2020): passing format mismatch',
      },
    ]);
  });
});
