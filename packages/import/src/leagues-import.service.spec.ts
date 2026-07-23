import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { ImportResultService } from './import-result.service';
import { ImportRunnerService } from './import-runner.service';
import { LeaguesImportService } from './leagues-import.service';
import type { ImportError } from './types';

describe('LeaguesImportService', () => {
  function makeService(upsertMock: ReturnType<typeof vi.fn>) {
    const client = { leagues: { upsert: upsertMock } } as unknown as ApiClient;
    return new LeaguesImportService(
      client,
      new ImportRunnerService(new ImportResultService()),
    );
  }

  it('returns true and calls the client with the given data on success', async () => {
    const upsertMock = vi.fn().mockResolvedValue({
      id: 1,
      name: 'Test League',
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];
    const data = {
      name: 'Test League',
      externalIds: [{ externalSystemId: 1, externalId: 'Test League' }],
    };

    const result = await service.upsertLeague(data, errors);

    expect(result).toEqual({
      id: 1,
      name: 'Test League',
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
    const data = {
      name: 'Test League',
      externalIds: [{ externalSystemId: 1, externalId: 'Test League' }],
    };

    const result = await service.upsertLeague(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      {
        item: data,
        message: 'Failed to import league "Test League": conflict',
      },
    ]);
  });

  it('records an error using String(err) when the client rejects with a non-Error value', async () => {
    const upsertMock = vi.fn().mockRejectedValue('boom');
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];
    const data = {
      name: 'Test League',
      externalIds: [{ externalSystemId: 1, externalId: 'Test League' }],
    };

    const result = await service.upsertLeague(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      {
        item: data,
        message: 'Failed to import league "Test League": boom',
      },
    ]);
  });

  it('resolves via real NestJS dependency injection, including the implicit-token ImportRunnerService', async () => {
    const upsertMock = vi.fn().mockResolvedValue({
      id: 1,
      name: 'Test League',
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    const client = { leagues: { upsert: upsertMock } } as unknown as ApiClient;

    const moduleRef = await Test.createTestingModule({
      providers: [
        LeaguesImportService,
        ImportResultService,
        ImportRunnerService,
        { provide: API_CLIENT, useValue: client },
      ],
    }).compile();

    const service = moduleRef.get(LeaguesImportService);
    const errors: ImportError[] = [];
    const data = {
      name: 'Test League',
      externalIds: [{ externalSystemId: 1, externalId: 'Test League' }],
    };

    const result = await service.upsertLeague(data, errors);

    expect(result).toEqual({
      id: 1,
      name: 'Test League',
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    expect(upsertMock).toHaveBeenCalledWith(data);
  });
});
