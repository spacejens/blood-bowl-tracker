import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { CompetitionsImportService } from './competitions-import.service';
import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

describe('CompetitionsImportService', () => {
  function makeService(upsertMock: ReturnType<typeof vi.fn>) {
    const client = {
      competitions: { upsert: upsertMock },
    } as unknown as ApiClient;
    return new CompetitionsImportService(client, new ImportRunnerService());
  }

  const data = {
    name: 'Major Season 24',
    type: 'season' as const,
    eraId: 20,
    externalIds: [{ externalSystemId: 1, externalId: '73' }],
  };

  it('returns true and calls the client with the given data on success', async () => {
    const upsertMock = vi.fn().mockResolvedValue({
      id: 1,
      name: 'Major Season 24',
      type: 'season',
      eraId: 20,
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];

    const result = await service.upsertCompetition(data, errors);

    expect(result).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('returns false and records an error when the client call fails', async () => {
    const upsertMock = vi.fn().mockRejectedValue(new Error('conflict'));
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];

    const result = await service.upsertCompetition(data, errors);

    expect(result).toBe(false);
    expect(errors).toEqual([
      {
        item: data,
        message: 'Failed to import competition "Major Season 24": conflict',
      },
    ]);
  });

  it('records an error using String(err) for a non-Error rejection', async () => {
    const upsertMock = vi.fn().mockRejectedValue('boom');
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];

    const result = await service.upsertCompetition(data, errors);

    expect(result).toBe(false);
    expect(errors).toEqual([
      {
        item: data,
        message: 'Failed to import competition "Major Season 24": boom',
      },
    ]);
  });

  it('resolves via real NestJS dependency injection, including the implicit-token ImportRunnerService', async () => {
    const upsertMock = vi.fn().mockResolvedValue({
      id: 1,
      name: 'Major Season 24',
      type: 'season',
      eraId: 20,
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    const client = {
      competitions: { upsert: upsertMock },
    } as unknown as ApiClient;

    const moduleRef = await Test.createTestingModule({
      providers: [
        CompetitionsImportService,
        ImportRunnerService,
        { provide: API_CLIENT, useValue: client },
      ],
    }).compile();

    const service = moduleRef.get(CompetitionsImportService);
    const errors: ImportError[] = [];

    const result = await service.upsertCompetition(data, errors);

    expect(result).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(data);
  });
});

describe('CompetitionsImportService.upsertCompetitionResult', () => {
  function makeService(upsertMock: ReturnType<typeof vi.fn>) {
    const client = {
      competitions: { upsert: upsertMock },
    } as unknown as ApiClient;
    return new CompetitionsImportService(client, new ImportRunnerService());
  }

  const data = {
    name: 'Major Season 24',
    type: 'season' as const,
    eraId: 20,
    externalIds: [{ externalSystemId: 1, externalId: '73' }],
  };

  it('resolves to the upserted competition, including its DB id, on success', async () => {
    const upsertMock = vi.fn().mockResolvedValue({
      id: 42,
      name: 'Major Season 24',
      type: 'season',
      eraId: 20,
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];

    const result = await service.upsertCompetitionResult(data, errors);

    expect(result).toEqual(
      expect.objectContaining({ id: 42, name: 'Major Season 24' }),
    );
    expect(upsertMock).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('resolves to undefined and records an error when the client call fails', async () => {
    const upsertMock = vi.fn().mockRejectedValue(new Error('conflict'));
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];

    const result = await service.upsertCompetitionResult(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      {
        item: data,
        message: 'Failed to import competition "Major Season 24": conflict',
      },
    ]);
  });
});
