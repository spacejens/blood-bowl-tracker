import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { ImportRunnerService } from './import-runner.service';
import { TeamsImportService } from './teams-import.service';
import type { ImportError } from './types';

describe('TeamsImportService', () => {
  function makeService(upsertMock: ReturnType<typeof vi.fn>) {
    const client = { teams: { upsert: upsertMock } } as unknown as ApiClient;
    return new TeamsImportService(client, new ImportRunnerService());
  }

  const data = {
    name: '40 grinders',
    raceId: 5,
    coachId: 9,
    externalIds: [{ externalSystemId: 1, externalId: '40g' }],
  };

  it('returns the upserted team on success', async () => {
    const upsertMock = vi.fn().mockResolvedValue({
      id: 1,
      name: '40 grinders',
      raceId: 5,
      coachId: 9,
      eras: [{ id: 100, eraId: 20 }],
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];

    const result = await service.upsertTeam(data, errors);

    expect(result).toEqual({
      id: 1,
      name: '40 grinders',
      raceId: 5,
      coachId: 9,
      eras: [{ id: 100, eraId: 20 }],
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

    const result = await service.upsertTeam(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      {
        item: data,
        message: 'Failed to import team "40 grinders": conflict',
      },
    ]);
  });

  it('records an error using String(err) when the client rejects with a non-Error value', async () => {
    const upsertMock = vi.fn().mockRejectedValue('boom');
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];

    const result = await service.upsertTeam(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      {
        item: data,
        message: 'Failed to import team "40 grinders": boom',
      },
    ]);
  });

  it('resolves via real NestJS dependency injection, including the implicit-token ImportRunnerService', async () => {
    const upsertMock = vi.fn().mockResolvedValue({
      id: 1,
      name: '40 grinders',
      raceId: 5,
      coachId: 9,
      eras: [],
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    const client = { teams: { upsert: upsertMock } } as unknown as ApiClient;

    const moduleRef = await Test.createTestingModule({
      providers: [
        TeamsImportService,
        ImportRunnerService,
        { provide: API_CLIENT, useValue: client },
      ],
    }).compile();

    const service = moduleRef.get(TeamsImportService);
    const errors: ImportError[] = [];

    const result = await service.upsertTeam(data, errors);

    expect(result).toBeTruthy();
    expect(upsertMock).toHaveBeenCalledWith(data);
  });
});
