import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { ImportRunnerService } from './import-runner.service';
import { PlayersImportService } from './players-import.service';
import type { ImportError } from './types';

describe('PlayersImportService', () => {
  function makeService(upsertMock: ReturnType<typeof vi.fn>) {
    const client = {
      players: { upsert: upsertMock },
    } as unknown as ApiClient;
    return new PlayersImportService(client, new ImportRunnerService());
  }

  const data = {
    name: 'Griff Oberwald',
    teamEraId: 10,
    positionId: 20,
    externalIds: [{ externalSystemId: 1, externalId: '12345' }],
  };

  it('returns true and calls the client with the given data on success', async () => {
    const upsertMock = vi.fn().mockResolvedValue({
      id: 1,
      name: 'Griff Oberwald',
      teamEraId: 10,
      positionId: 20,
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];

    const result = await service.upsertPlayer(data, errors);

    expect(result).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('returns false and records an error when the client call fails', async () => {
    const upsertMock = vi.fn().mockRejectedValue(new Error('conflict'));
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];

    const result = await service.upsertPlayer(data, errors);

    expect(result).toBe(false);
    expect(errors).toEqual([
      {
        item: data,
        message: 'Failed to import player "Griff Oberwald": conflict',
      },
    ]);
  });

  it('records an error using String(err) when the client rejects with a non-Error value', async () => {
    const upsertMock = vi.fn().mockRejectedValue('boom');
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];

    const result = await service.upsertPlayer(data, errors);

    expect(result).toBe(false);
    expect(errors).toEqual([
      {
        item: data,
        message: 'Failed to import player "Griff Oberwald": boom',
      },
    ]);
  });

  it('resolves via real NestJS dependency injection', async () => {
    const upsertMock = vi.fn().mockResolvedValue({
      id: 1,
      name: 'Griff Oberwald',
      teamEraId: 10,
      positionId: 20,
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    const client = {
      players: { upsert: upsertMock },
    } as unknown as ApiClient;

    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayersImportService,
        ImportRunnerService,
        { provide: API_CLIENT, useValue: client },
      ],
    }).compile();

    const service = moduleRef.get(PlayersImportService);
    const errors: ImportError[] = [];

    const result = await service.upsertPlayer(data, errors);

    expect(result).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(data);
  });
});
