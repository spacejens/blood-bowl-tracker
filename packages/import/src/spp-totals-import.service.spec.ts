import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { stubImportRunner } from './import-runner.test-helpers';
import { SppTotalsImportService } from './spp-totals-import.service';
import type { ImportError } from './types';

describe('SppTotalsImportService', () => {
  let service: SppTotalsImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    stubImportRunner(runner);
    const moduleRef = await Test.createTestingModule({
      providers: [
        SppTotalsImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(SppTotalsImportService);
  });

  const data = { playerIds: [1, 2] };

  it('returns the RPC result and calls the client with the given data on success', async () => {
    client.players.syncComputedSppTotals.mockResolvedValue({
      updatedPlayerIds: [1, 2],
    });
    const errors: ImportError[] = [];

    const result = await service.syncComputedSppTotals(data, errors);

    expect(result).toEqual({ updatedPlayerIds: [1, 2] });
    expect(client.players.syncComputedSppTotals).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('resolves to undefined and records an error when the client call fails', async () => {
    client.players.syncComputedSppTotals.mockRejectedValue(new Error('boom'));
    const errors: ImportError[] = [];

    const result = await service.syncComputedSppTotals(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      {
        item: data,
        message: 'Failed to sync computed SPP totals for 2 player(s): boom',
      },
    ]);
  });

  it('records an error using String(err) for a non-Error rejection', async () => {
    client.players.syncComputedSppTotals.mockRejectedValue('nope');
    const errors: ImportError[] = [];

    await service.syncComputedSppTotals(data, errors);

    expect(errors).toEqual([
      {
        item: data,
        message: 'Failed to sync computed SPP totals for 2 player(s): nope',
      },
    ]);
  });
});
