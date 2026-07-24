import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { stubImportRunner } from './import-runner.test-helpers';
import { LeaguesImportService } from './leagues-import.service';
import type { ImportError } from './types';

describe('LeaguesImportService', () => {
  let service: LeaguesImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    stubImportRunner(runner);
    const moduleRef = await Test.createTestingModule({
      providers: [
        LeaguesImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(LeaguesImportService);
  });

  it('returns true and calls the client with the given data on success', async () => {
    client.leagues.upsert.mockResolvedValue({
      id: 1,
      name: 'Test League',
      createdAt: new Date('2026-01-01'),
      created: true,
    });
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
    expect(client.leagues.upsert).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('returns false and records an error when the client call fails', async () => {
    client.leagues.upsert.mockRejectedValue(new Error('conflict'));
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
    client.leagues.upsert.mockRejectedValue('boom');
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
});
