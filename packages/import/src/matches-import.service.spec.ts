import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { ImportResultService } from './import-result.service';
import { ImportRunnerService } from './import-runner.service';
import { MatchesImportService } from './matches-import.service';
import type { ImportError } from './types';

describe('MatchesImportService', () => {
  function makeService(upsertMock: ReturnType<typeof vi.fn>) {
    const client = {
      matches: { upsert: upsertMock },
    } as unknown as ApiClient;
    return new MatchesImportService(
      client,
      new ImportRunnerService(new ImportResultService()),
    );
  }

  const data = {
    competitionId: 20,
    playedAt: new Date('2021-09-25'),
    name: 'Test Match',
    externalIds: [{ externalSystemId: 1, externalId: '89' }],
    teamEraIds: [],
  };

  it('returns true and calls the client with the given data on success', async () => {
    const upsertMock = vi.fn().mockResolvedValue({
      id: 1,
      competitionId: 20,
      playedAt: new Date('2021-09-25'),
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];

    const result = await service.upsertMatch(data, errors);

    expect(result).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('returns false and records an error when the client call fails', async () => {
    const upsertMock = vi.fn().mockRejectedValue(new Error('conflict'));
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];

    const result = await service.upsertMatch(data, errors);

    expect(result).toBe(false);
    expect(errors).toEqual([
      { item: data, message: 'Failed to import match "89": conflict' },
    ]);
  });

  it('records an error using String(err) for a non-Error rejection', async () => {
    const upsertMock = vi.fn().mockRejectedValue('boom');
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];

    const result = await service.upsertMatch(data, errors);

    expect(result).toBe(false);
    expect(errors).toEqual([
      { item: data, message: 'Failed to import match "89": boom' },
    ]);
  });

  it('resolves via real NestJS dependency injection, including the implicit-token ImportRunnerService', async () => {
    const upsertMock = vi.fn().mockResolvedValue({
      id: 1,
      competitionId: 20,
      playedAt: new Date('2021-09-25'),
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    const client = {
      matches: { upsert: upsertMock },
    } as unknown as ApiClient;

    const moduleRef = await Test.createTestingModule({
      providers: [
        MatchesImportService,
        ImportResultService,
        ImportRunnerService,
        { provide: API_CLIENT, useValue: client },
      ],
    }).compile();

    const service = moduleRef.get(MatchesImportService);
    const errors: ImportError[] = [];

    const result = await service.upsertMatch(data, errors);

    expect(result).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(data);
  });
});

describe('MatchesImportService.upsertMatchResult', () => {
  function makeService(upsertMock: ReturnType<typeof vi.fn>) {
    const client = {
      matches: { upsert: upsertMock },
    } as unknown as ApiClient;
    return new MatchesImportService(
      client,
      new ImportRunnerService(new ImportResultService()),
    );
  }

  const data = {
    competitionId: 20,
    playedAt: new Date('2021-09-25'),
    name: 'Test Match',
    externalIds: [{ externalSystemId: 1, externalId: '89' }],
    teamEraIds: [],
  };

  it('resolves to the upserted match, including its DB id, on success', async () => {
    const upsertMock = vi.fn().mockResolvedValue({
      id: 42,
      competitionId: 20,
      playedAt: new Date('2021-09-25'),
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];

    const result = await service.upsertMatchResult(data, errors);

    expect(result).toEqual(expect.objectContaining({ id: 42 }));
    expect(upsertMock).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('resolves to undefined and records an error when the client call fails', async () => {
    const upsertMock = vi.fn().mockRejectedValue(new Error('conflict'));
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];

    const result = await service.upsertMatchResult(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      { item: data, message: 'Failed to import match "89": conflict' },
    ]);
  });

  it('records an error using String(err) for a non-Error rejection', async () => {
    const upsertMock = vi.fn().mockRejectedValue('boom');
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];

    const result = await service.upsertMatchResult(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      { item: data, message: 'Failed to import match "89": boom' },
    ]);
  });
});
