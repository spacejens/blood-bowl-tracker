import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { stubImportRunner } from './import-runner.test-helpers';
import { SppAwardValuesImportService } from './spp-award-values-import.service';
import type { ImportError } from './types';

describe('SppAwardValuesImportService', () => {
  let service: SppAwardValuesImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    stubImportRunner(runner);
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

  it('returns the result and calls the client with the given data on success', async () => {
    client.sppAwardValues.sync.mockResolvedValue({ sppAwardValueIds: [11] });
    const errors: ImportError[] = [];

    const result = await service.syncSppAwardValues(data, errors);

    expect(result).toEqual({ sppAwardValueIds: [11] });
    expect(client.sppAwardValues.sync).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('returns undefined and records an error when the client call fails', async () => {
    client.sppAwardValues.sync.mockRejectedValue(new Error('boom'));
    const errors: ImportError[] = [];

    const result = await service.syncSppAwardValues(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      { item: data, message: 'Failed to sync 1 SPP award value(s): boom' },
    ]);
  });

  it('records an error using String(err) when the client rejects with a non-Error value', async () => {
    client.sppAwardValues.sync.mockRejectedValue('nope');
    const errors: ImportError[] = [];

    await service.syncSppAwardValues(data, errors);

    expect(errors).toEqual([
      { item: data, message: 'Failed to sync 1 SPP award value(s): nope' },
    ]);
  });
});
