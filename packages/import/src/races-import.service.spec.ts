import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { ImportRunnerService } from './import-runner.service';
import { RacesImportService } from './races-import.service';
import type { ImportError } from './types';

describe('RacesImportService', () => {
  function makeService(upsertMock: ReturnType<typeof vi.fn>) {
    const client = { races: { upsert: upsertMock } } as unknown as ApiClient;
    return new RacesImportService(client, new ImportRunnerService());
  }

  const data = {
    name: 'Orc',
    eras: [],
    externalIds: [{ externalSystemId: 1, externalId: 'Orc' }],
  };
  const upsertResult = {
    id: 1,
    name: 'Orc',
    createdAt: new Date('2026-01-01'),
    created: true,
  };

  it('returns the upsert result and calls the client with the given data on success', async () => {
    const upsertMock = vi.fn().mockResolvedValue(upsertResult);
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];

    const result = await service.upsertRace(data, errors);

    expect(result).toEqual(upsertResult);
    expect(upsertMock).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('returns undefined and records an error when the client call fails', async () => {
    const upsertMock = vi.fn().mockRejectedValue(new Error('conflict'));
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];

    const result = await service.upsertRace(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      {
        item: data,
        message: 'Failed to import race "Orc": conflict',
      },
    ]);
  });

  it('records an error using String(err) when the client rejects with a non-Error value', async () => {
    const upsertMock = vi.fn().mockRejectedValue('boom');
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];

    const result = await service.upsertRace(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      {
        item: data,
        message: 'Failed to import race "Orc": boom',
      },
    ]);
  });

  it('forwards eras field to client.races.upsert when provided', async () => {
    const upsertMock = vi.fn().mockResolvedValue(upsertResult);
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];
    const dataWithEras = {
      name: 'Orc',
      externalIds: [{ externalSystemId: 1, externalId: 'Orc' }],
      eras: [1, 2],
    };

    const result = await service.upsertRace(dataWithEras, errors);

    expect(result).toEqual(upsertResult);
    expect(upsertMock).toHaveBeenCalledWith(dataWithEras);
    expect(errors).toHaveLength(0);
  });

  it('resolves via real NestJS dependency injection, including the implicit-token ImportRunnerService', async () => {
    const upsertMock = vi.fn().mockResolvedValue(upsertResult);
    const client = { races: { upsert: upsertMock } } as unknown as ApiClient;

    const moduleRef = await Test.createTestingModule({
      providers: [
        RacesImportService,
        ImportRunnerService,
        { provide: API_CLIENT, useValue: client },
      ],
    }).compile();

    const service = moduleRef.get(RacesImportService);
    const errors: ImportError[] = [];

    const result = await service.upsertRace(data, errors);

    expect(result).toEqual(upsertResult);
    expect(upsertMock).toHaveBeenCalledWith(data);
  });
});
