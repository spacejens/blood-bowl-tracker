import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { AdvancementCostsImportService } from './advancement-costs-import.service';
import { ImportRunnerService } from './import-runner.service';
import { recordUpsertResultOptions } from './import-runner.test-helpers';
import type { ImportError } from './types';

describe('AdvancementCostsImportService', () => {
  let service: AdvancementCostsImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdvancementCostsImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(AdvancementCostsImportService);
  });

  const data = {
    costs: [
      {
        rulesSetId: 1,
        advancementNumber: 1,
        advancementKind: 'table_roll' as const,
        sppCost: 6,
      },
    ],
  };

  it('returns the runner result unchanged', async () => {
    const synced = { advancementCostIds: [11] };
    runner.recordUpsertResult.mockResolvedValue(synced);

    const result = await service.syncAdvancementCosts(data, []);

    expect(result).toBe(synced);
  });

  it('returns undefined when the runner recorded a failure', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    const result = await service.syncAdvancementCosts(data, []);

    expect(result).toBeUndefined();
  });

  it('hands the runner the data as item, the caller error list, and an upsert that calls the client', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);
    client.advancementCosts.sync.mockResolvedValue({
      advancementCostIds: [11],
    });
    const errors: ImportError[] = [];

    await service.syncAdvancementCosts(data, errors);

    const options = recordUpsertResultOptions(runner);
    expect(options.item).toBe(data);
    expect(options.errors).toBe(errors);
    await expect(options.upsert()).resolves.toEqual({
      advancementCostIds: [11],
    });
    expect(client.advancementCosts.sync).toHaveBeenCalledWith(data);
  });

  it('builds a failure message naming the batch size', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.syncAdvancementCosts(data, []);

    const { buildErrorMessage } = recordUpsertResultOptions(runner);
    expect(buildErrorMessage(new Error('boom'))).toBe(
      'Failed to sync 1 advancement cost(s): boom',
    );
    expect(buildErrorMessage('nope')).toBe(
      'Failed to sync 1 advancement cost(s): nope',
    );
  });

  it('hands a league granted-skill cost to the client unchanged', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);
    client.advancementCosts.sync.mockResolvedValue({
      advancementCostIds: [21],
    });
    const leagueData = {
      costs: [
        {
          rulesSetId: 1,
          leagueId: 3,
          advancementNumber: 7,
          advancementKind: 'granted_skill' as const,
          skillId: 40,
          sppCost: 125,
        },
      ],
    };

    await service.syncAdvancementCosts(leagueData, []);

    await recordUpsertResultOptions(runner).upsert();
    expect(client.advancementCosts.sync).toHaveBeenCalledWith(leagueData);
  });
});
