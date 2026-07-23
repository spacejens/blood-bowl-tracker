import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { CoachesImportService } from './coaches-import.service';
import { ImportResultService } from './import-result.service';
import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

describe('CoachesImportService', () => {
  function makeService(upsertMock: ReturnType<typeof vi.fn>) {
    const client = { coaches: { upsert: upsertMock } } as unknown as ApiClient;
    return new CoachesImportService(
      client,
      new ImportRunnerService(new ImportResultService()),
    );
  }

  const data = {
    name: 'Roze Madder',
    externalIds: [{ externalSystemId: 1, externalId: 'id:1' }],
  };
  const upsertResult = {
    id: 1,
    name: 'Roze Madder',
    createdAt: new Date('2026-01-01'),
    created: true,
  };

  it('returns the upsert result and calls the client with the given data on success', async () => {
    const upsertMock = vi.fn().mockResolvedValue(upsertResult);
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];

    const result = await service.upsertCoach(data, errors);

    expect(result).toEqual(upsertResult);
    expect(upsertMock).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('returns undefined and records an error when the client call fails', async () => {
    const upsertMock = vi.fn().mockRejectedValue(new Error('conflict'));
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];

    const result = await service.upsertCoach(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      {
        item: data,
        message: 'Failed to import coach "Roze Madder": conflict',
      },
    ]);
  });

  it('records an error using String(err) when the client rejects with a non-Error value', async () => {
    const upsertMock = vi.fn().mockRejectedValue('boom');
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];

    const result = await service.upsertCoach(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      {
        item: data,
        message: 'Failed to import coach "Roze Madder": boom',
      },
    ]);
  });

  it('resolves via real NestJS dependency injection, including the implicit-token ImportRunnerService', async () => {
    const upsertMock = vi.fn().mockResolvedValue(upsertResult);
    const client = { coaches: { upsert: upsertMock } } as unknown as ApiClient;

    const moduleRef = await Test.createTestingModule({
      providers: [
        CoachesImportService,
        ImportResultService,
        ImportRunnerService,
        { provide: API_CLIENT, useValue: client },
      ],
    }).compile();

    const service = moduleRef.get(CoachesImportService);
    const errors: ImportError[] = [];

    const result = await service.upsertCoach(data, errors);

    expect(result).toEqual(upsertResult);
    expect(upsertMock).toHaveBeenCalledWith(data);
  });
});
