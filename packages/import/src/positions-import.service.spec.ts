import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { ImportResultService } from './import-result.service';
import { ImportRunnerService } from './import-runner.service';
import { PositionsImportService } from './positions-import.service';
import type { ImportError } from './types';

describe('PositionsImportService', () => {
  function makeService(
    upsertMock: ReturnType<typeof vi.fn>,
    syncRaceErasMock?: ReturnType<typeof vi.fn>,
  ) {
    const client = {
      positions: {
        upsert: upsertMock,
        syncRaceEras: syncRaceErasMock ?? vi.fn(),
      },
    } as unknown as ApiClient;
    return new PositionsImportService(
      client,
      new ImportRunnerService(new ImportResultService()),
    );
  }

  const data = {
    name: 'Lineman',
    isStarPlayer: false,
    externalIds: [{ externalSystemId: 1, externalId: '10-7' }],
  };

  it('returns true and calls the client with the given data on success', async () => {
    const upsertMock = vi.fn().mockResolvedValue({
      id: 1,
      name: 'Lineman',
      raceId: 7,
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];

    const result = await service.upsertPosition(data, errors);

    expect(result).toEqual({
      id: 1,
      name: 'Lineman',
      raceId: 7,
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    expect(upsertMock).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('returns false and records an error when the client call fails', async () => {
    const upsertMock = vi.fn().mockRejectedValue(new Error('conflict'));
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];

    const result = await service.upsertPosition(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      { item: data, message: 'Failed to import position "Lineman": conflict' },
    ]);
  });

  it('records an error using String(err) when the client rejects with a non-Error value', async () => {
    const upsertMock = vi.fn().mockRejectedValue('boom');
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];

    const result = await service.upsertPosition(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      { item: data, message: 'Failed to import position "Lineman": boom' },
    ]);
  });

  it('resolves via real NestJS dependency injection', async () => {
    const upsertMock = vi.fn().mockResolvedValue({
      id: 1,
      name: 'Lineman',
      raceId: 7,
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    const client = {
      positions: { upsert: upsertMock },
    } as unknown as ApiClient;

    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionsImportService,
        ImportResultService,
        ImportRunnerService,
        { provide: API_CLIENT, useValue: client },
      ],
    }).compile();

    const service = moduleRef.get(PositionsImportService);
    const errors: ImportError[] = [];

    const result = await service.upsertPosition(data, errors);

    expect(result).toEqual({
      id: 1,
      name: 'Lineman',
      raceId: 7,
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    expect(upsertMock).toHaveBeenCalledWith(data);
  });

  describe('syncRaceEras', () => {
    const syncData = {
      positionId: 1,
      raceEras: [{ raceId: 7, eraId: 2 }],
    };

    it('returns the result and calls the client with the given data on success', async () => {
      const syncRaceErasMock = vi.fn().mockResolvedValue({
        positionId: 1,
        raceEraIds: [42],
      });
      const service = makeService(vi.fn(), syncRaceErasMock);
      const errors: ImportError[] = [];

      const result = await service.syncRaceEras(syncData, errors);

      expect(result).toEqual({ positionId: 1, raceEraIds: [42] });
      expect(syncRaceErasMock).toHaveBeenCalledWith(syncData);
      expect(errors).toHaveLength(0);
    });

    it('returns undefined and records an error when the client call fails', async () => {
      const syncRaceErasMock = vi.fn().mockRejectedValue(new Error('conflict'));
      const service = makeService(vi.fn(), syncRaceErasMock);
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
