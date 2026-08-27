import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { stubImportRunner } from './import-runner.test-helpers';
import { PositionsImportService } from './positions-import.service';
import type { ImportError } from './types';

describe('PositionsImportService', () => {
  let service: PositionsImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    stubImportRunner(runner);
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
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.upsert(data, []);

    await runner.recordUpsertResult.mock.calls[0][0].upsert();
    expect(client.positions.upsert).toHaveBeenCalledWith(data);
  });

  it('names the position in its error message', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.upsert(data, []);

    const options = runner.recordUpsertResult.mock.calls[0][0];
    expect(options.buildErrorMessage(new Error('conflict'))).toBe(
      'Failed to import position "Lineman": conflict',
    );
  });

  describe('syncRaceEras', () => {
    const syncData = {
      positionId: 1,
      raceEras: [{ raceId: 7, eraId: 2 }],
    };

    it('returns the result and calls the client with the given data on success', async () => {
      client.positions.syncRaceEras.mockResolvedValue({
        positionId: 1,
        raceEraIds: [42],
      });
      const errors: ImportError[] = [];

      const result = await service.syncRaceEras(syncData, errors);

      expect(result).toEqual({ positionId: 1, raceEraIds: [42] });
      expect(client.positions.syncRaceEras).toHaveBeenCalledWith(syncData);
      expect(errors).toHaveLength(0);
    });

    it('returns undefined and records an error when the client call fails', async () => {
      client.positions.syncRaceEras.mockRejectedValue(new Error('conflict'));
      const errors: ImportError[] = [];

      const result = await service.syncRaceEras(syncData, errors);

      expect(result).toBeUndefined();
      expect(errors).toEqual([
        {
          item: syncData,
          message: 'Failed to sync race eras for position 1: conflict',
        },
      ]);
    });
  });
});
