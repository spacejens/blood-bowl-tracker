import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { stubImportRunner } from './import-runner.test-helpers';
import { PositionRulesSetsImportService } from './position-rules-sets-import.service';
import type { ImportError } from './types';

describe('PositionRulesSetsImportService', () => {
  let service: PositionRulesSetsImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    stubImportRunner(runner);
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

  it('returns the result and calls the client with the given data on success', async () => {
    client.positionRulesSets.sync.mockResolvedValue({
      positionRulesSetIds: [21],
    });
    const errors: ImportError[] = [];

    const result = await service.syncPositionRulesSets(data, errors);

    expect(result).toEqual({ positionRulesSetIds: [21] });
    expect(client.positionRulesSets.sync).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('returns undefined and records an error when the client call fails', async () => {
    client.positionRulesSets.sync.mockRejectedValue(new Error('boom'));
    const errors: ImportError[] = [];

    const result = await service.syncPositionRulesSets(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      {
        item: data,
        message:
          'Failed to sync characteristics for 1 position/rules-set pair(s): boom',
      },
    ]);
  });

  it('records an error using String(err) when the client rejects with a non-Error value', async () => {
    client.positionRulesSets.sync.mockRejectedValue('nope');
    const errors: ImportError[] = [];

    await service.syncPositionRulesSets(data, errors);

    expect(errors).toEqual([
      {
        item: data,
        message:
          'Failed to sync characteristics for 1 position/rules-set pair(s): nope',
      },
    ]);
  });
});
