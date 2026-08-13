import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { CompetitionsImportService } from './competitions-import.service';
import { ImportRunnerService } from './import-runner.service';
import { stubImportRunner } from './import-runner.test-helpers';
import type { ImportError } from './types';

async function makeModule() {
  const client = mockDeep<ApiClient>();
  const runner = mock<ImportRunnerService>();
  stubImportRunner(runner);
  const moduleRef = await Test.createTestingModule({
    providers: [
      CompetitionsImportService,
      { provide: API_CLIENT, useValue: client },
      { provide: ImportRunnerService, useValue: runner },
    ],
  }).compile();
  return { service: moduleRef.get(CompetitionsImportService), client };
}

describe('CompetitionsImportService', () => {
  let service: CompetitionsImportService;
  let client: DeepMockProxy<ApiClient>;

  beforeEach(async () => {
    ({ service, client } = await makeModule());
  });

  const data = {
    name: 'Major Season 24',
    type: 'season' as const,
    eraId: 20,
    teamEraIds: [],
    externalIds: [{ externalSystemId: 1, externalId: '73' }],
  };

  it('returns true and calls the client with the given data on success', async () => {
    client.competitions.upsert.mockResolvedValue({
      id: 1,
      name: 'Major Season 24',
      type: 'season',
      eraId: 20,
      teamEraIds: [],
      startDate: null,
      endDate: null,
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    const errors: ImportError[] = [];

    const result = await service.upsertCompetition(data, errors);

    expect(result).toBe(true);
    expect(client.competitions.upsert).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('returns false and records an error when the client call fails', async () => {
    client.competitions.upsert.mockRejectedValue(new Error('conflict'));
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
    client.competitions.upsert.mockRejectedValue('boom');
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
});

describe('CompetitionsImportService.upsertCompetitionResult', () => {
  let service: CompetitionsImportService;
  let client: DeepMockProxy<ApiClient>;

  beforeEach(async () => {
    ({ service, client } = await makeModule());
  });

  const data = {
    name: 'Major Season 24',
    type: 'season' as const,
    eraId: 20,
    teamEraIds: [],
    externalIds: [{ externalSystemId: 1, externalId: '73' }],
  };

  it('resolves to the upserted competition, including its DB id, on success', async () => {
    client.competitions.upsert.mockResolvedValue({
      id: 42,
      name: 'Major Season 24',
      type: 'season',
      eraId: 20,
      teamEraIds: [],
      startDate: null,
      endDate: null,
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    const errors: ImportError[] = [];

    const result = await service.upsertCompetitionResult(data, errors);

    expect(result).toEqual(
      expect.objectContaining({ id: 42, name: 'Major Season 24' }),
    );
    expect(client.competitions.upsert).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('resolves to undefined and records an error when the client call fails', async () => {
    client.competitions.upsert.mockRejectedValue(new Error('conflict'));
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
