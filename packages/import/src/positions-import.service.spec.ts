import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { recordUpsertResultOptions } from './import-runner.test-helpers';
import { PositionsImportService } from './positions-import.service';
import type { ImportError } from './types';

describe('PositionsImportService', () => {
  let service: PositionsImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionsImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(PositionsImportService);
  });

  const data = {
    name: 'Lineman',
    isStarPlayer: false,
    externalIds: [{ externalSystemId: 1, externalId: '10-7' }],
  };

  it('upserts through the positions resource', async () => {
    const upserted = {
      id: 3,
      name: 'Lineman',
      isStarPlayer: false,
      createdAt: new Date(),
      created: true,
    };
    runner.recordUpsertResult.mockResolvedValue(upserted);
    client.positions.upsert.mockResolvedValue(upserted);
    const errors: ImportError[] = [];

    const result = await service.upsert(data, errors);

    expect(result).toBe(upserted);
    const options = recordUpsertResultOptions(runner);
    expect(options.item).toBe(data);
    expect(options.errors).toBe(errors);
    await expect(options.upsert()).resolves.toBe(upserted);
    expect(client.positions.upsert).toHaveBeenCalledWith(data);
  });

  it('names the position in its error message', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.upsert(data, []);

    const { buildErrorMessage } = recordUpsertResultOptions(runner);
    expect(buildErrorMessage(new Error('conflict'))).toBe(
      'Failed to import position "Lineman": conflict',
    );
    expect(buildErrorMessage('boom')).toBe(
      'Failed to import position "Lineman": boom',
    );
  });

  describe('syncRaceEras', () => {
    const syncData = {
      positionId: 1,
      raceEras: [{ raceId: 7, eraId: 2 }],
    };

    it('returns the result and calls the client with the given data on success', async () => {
      const synced = { positionId: 1, raceEraIds: [42] };
      runner.recordUpsertResult.mockResolvedValue(synced);
      client.positions.syncRaceEras.mockResolvedValue(synced);
      const errors: ImportError[] = [];

      const result = await service.syncRaceEras(syncData, errors);

      expect(result).toBe(synced);
      const options = recordUpsertResultOptions(runner);
      expect(options.item).toBe(syncData);
      expect(options.errors).toBe(errors);
      await expect(options.upsert()).resolves.toBe(synced);
      expect(client.positions.syncRaceEras).toHaveBeenCalledWith(syncData);
    });

    it('returns undefined and records an error when the client call fails', async () => {
      runner.recordUpsertResult.mockResolvedValue(undefined);

      const result = await service.syncRaceEras(syncData, []);

      expect(result).toBeUndefined();
      const { buildErrorMessage } = recordUpsertResultOptions(runner);
      expect(buildErrorMessage(new Error('conflict'))).toBe(
        'Failed to sync race eras for position 1: conflict',
      );
      expect(buildErrorMessage('boom')).toBe(
        'Failed to sync race eras for position 1: boom',
      );
    });
  });
});
