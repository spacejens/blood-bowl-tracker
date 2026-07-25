import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { CoachesImportService } from './coaches-import.service';
import { ImportRunnerService } from './import-runner.service';
import { stubImportRunner } from './import-runner.test-helpers';
import type { ImportError } from './types';

describe('CoachesImportService', () => {
  let service: CoachesImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    stubImportRunner(runner);
    const moduleRef = await Test.createTestingModule({
      providers: [
        CoachesImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(CoachesImportService);
  });

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
    client.coaches.upsert.mockResolvedValue(upsertResult);
    const errors: ImportError[] = [];

    const result = await service.upsertCoach(data, errors);

    expect(result).toEqual(upsertResult);
    expect(client.coaches.upsert).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('returns undefined and records an error when the client call fails', async () => {
    client.coaches.upsert.mockRejectedValue(new Error('conflict'));
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
    client.coaches.upsert.mockRejectedValue('boom');
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
});
