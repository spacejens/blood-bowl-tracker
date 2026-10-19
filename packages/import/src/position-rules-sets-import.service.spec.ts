import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { recordUpsertResultOptions } from './import-runner.test-helpers';
import { PositionRulesSetsImportService } from './position-rules-sets-import.service';
import type { ImportError } from './types';

describe('PositionRulesSetsImportService', () => {
  let service: PositionRulesSetsImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionRulesSetsImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(PositionRulesSetsImportService);
  });

  const data = {
    entries: [
      {
        positionId: 3,
        rulesSetId: 4,
        move: 6,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 9,
      },
    ],
  };

  it('returns the runner result unchanged', async () => {
    const synced = { positionRulesSetIds: [21] };
    runner.recordUpsertResult.mockResolvedValue(synced);

    const result = await service.syncPositionRulesSets(data, []);

    expect(result).toBe(synced);
  });

  it('returns undefined when the runner recorded a failure', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    const result = await service.syncPositionRulesSets(data, []);

    expect(result).toBeUndefined();
  });

  it('hands the runner the data as item, the caller error list, and an upsert that calls the client', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);
    client.positionRulesSets.sync.mockResolvedValue({
      positionRulesSetIds: [21],
    });
    const errors: ImportError[] = [];

    await service.syncPositionRulesSets(data, errors);

    const options = recordUpsertResultOptions(runner);
    expect(options.item).toBe(data);
    expect(options.errors).toBe(errors);
    await expect(options.upsert()).resolves.toEqual({
      positionRulesSetIds: [21],
    });
    expect(client.positionRulesSets.sync).toHaveBeenCalledWith(data);
  });

  it('builds a failure message naming the batch size', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.syncPositionRulesSets(data, []);

    const { buildErrorMessage } = recordUpsertResultOptions(runner);
    expect(buildErrorMessage(new Error('boom'))).toBe(
      'Failed to sync 1 position/rules-set pair(s): boom',
    );
    expect(buildErrorMessage('nope')).toBe(
      'Failed to sync 1 position/rules-set pair(s): nope',
    );
  });
});
