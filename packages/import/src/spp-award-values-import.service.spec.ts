import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { recordUpsertResultOptions } from './import-runner.test-helpers';
import { SppAwardValuesImportService } from './spp-award-values-import.service';
import type { ImportError } from './types';

describe('SppAwardValuesImportService', () => {
  let service: SppAwardValuesImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SppAwardValuesImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(SppAwardValuesImportService);
  });

  const data = {
    values: [
      {
        rulesSetId: 1,
        raceId: null,
        actionType: 'touchdown' as const,
        sppValue: 3,
      },
    ],
  };

  it('returns the runner result unchanged', async () => {
    const synced = { sppAwardValueIds: [11] };
    runner.recordUpsertResult.mockResolvedValue(synced);

    const result = await service.syncSppAwardValues(data, []);

    expect(result).toBe(synced);
  });

  it('returns undefined when the runner recorded a failure', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    const result = await service.syncSppAwardValues(data, []);

    expect(result).toBeUndefined();
  });

  it('hands the runner the data as item, the caller error list, and an upsert that calls the client', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);
    client.sppAwardValues.sync.mockResolvedValue({ sppAwardValueIds: [11] });
    const errors: ImportError[] = [];

    await service.syncSppAwardValues(data, errors);

    const options = recordUpsertResultOptions(runner);
    expect(options.item).toBe(data);
    expect(options.errors).toBe(errors);
    await expect(options.upsert()).resolves.toEqual({
      sppAwardValueIds: [11],
    });
    expect(client.sppAwardValues.sync).toHaveBeenCalledWith(data);
  });

  it('builds a failure message naming the batch size', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.syncSppAwardValues(data, []);

    const { buildErrorMessage } = recordUpsertResultOptions(runner);
    expect(buildErrorMessage(new Error('boom'))).toBe(
      'Failed to sync 1 SPP award value(s): boom',
    );
    expect(buildErrorMessage('nope')).toBe(
      'Failed to sync 1 SPP award value(s): nope',
    );
  });
});
