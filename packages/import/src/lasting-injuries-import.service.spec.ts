import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { recordUpsertResultOptions } from './import-runner.test-helpers';
import { LastingInjuriesImportService } from './lasting-injuries-import.service';
import type { ImportError } from './types';

describe('LastingInjuriesImportService', () => {
  let service: LastingInjuriesImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;
  let errors: ImportError[];

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        LastingInjuriesImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(LastingInjuriesImportService);
  });

  it('returns the runner result unchanged', async () => {
    const synced = { backfilledPlayerIds: [7] };
    runner.recordUpsertResult.mockResolvedValue(synced);

    const result = await service.syncLastingInjuryHistory(
      { playerIds: [7, 8] },
      errors,
    );

    expect(result).toBe(synced);
  });

  it('returns undefined when the runner recorded a failure', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    const result = await service.syncLastingInjuryHistory(
      { playerIds: [7, 8] },
      errors,
    );

    expect(result).toBeUndefined();
  });

  it('hands the runner the payload as item, the caller error list, and an upsert that calls the client', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);
    client.players.syncLastingInjuryHistory.mockResolvedValue({
      backfilledPlayerIds: [7],
    });

    await service.syncLastingInjuryHistory({ playerIds: [7, 8] }, errors);

    const options = recordUpsertResultOptions(runner);
    expect(options.item).toEqual({ playerIds: [7, 8] });
    expect(options.errors).toBe(errors);
    await expect(options.upsert()).resolves.toEqual({
      backfilledPlayerIds: [7],
    });
    expect(client.players.syncLastingInjuryHistory).toHaveBeenCalledWith({
      playerIds: [7, 8],
    });
  });

  it('builds a failure message naming the batch size', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.syncLastingInjuryHistory({ playerIds: [7, 8] }, errors);

    const { buildErrorMessage } = recordUpsertResultOptions(runner);
    expect(buildErrorMessage(new Error('boom'))).toBe(
      'Failed to backfill lasting-injury history for 2 player(s): boom',
    );
    expect(buildErrorMessage('nope')).toBe(
      'Failed to backfill lasting-injury history for 2 player(s): nope',
    );
  });
});
