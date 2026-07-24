import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { stubImportRunner } from './import-runner.test-helpers';
import { TeamsImportService } from './teams-import.service';
import type { ImportError } from './types';

describe('TeamsImportService', () => {
  let service: TeamsImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    stubImportRunner(runner);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TeamsImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(TeamsImportService);
  });

  const data = {
    name: '40 grinders',
    raceId: 5,
    coachId: 9,
    eras: [],
    externalIds: [{ externalSystemId: 1, externalId: '40g' }],
  };

  it('returns the upserted team on success', async () => {
    client.teams.upsert.mockResolvedValue({
      id: 1,
      name: '40 grinders',
      raceId: 5,
      coachId: 9,
      eras: [{ id: 100, eraId: 20 }],
      createdAt: new Date('2026-01-01'),
      created: true,
    });
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
    expect(client.teams.upsert).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('returns false and records an error when the client call fails', async () => {
    client.teams.upsert.mockRejectedValue(new Error('conflict'));
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
    client.teams.upsert.mockRejectedValue('boom');
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
});
