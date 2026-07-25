import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { stubImportRunner } from './import-runner.test-helpers';
import { RacesImportService } from './races-import.service';
import type { ImportError } from './types';

describe('RacesImportService', () => {
  let service: RacesImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    stubImportRunner(runner);
    const moduleRef = await Test.createTestingModule({
      providers: [
        RacesImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(RacesImportService);
  });

  const data = {
    name: 'Orc',
    eras: [],
    externalIds: [{ externalSystemId: 1, externalId: 'Orc' }],
  };
  const upsertResult = {
    id: 1,
    name: 'Orc',
    eras: [],
    createdAt: new Date('2026-01-01'),
    created: true,
  };

  it('returns the upsert result and calls the client with the given data on success', async () => {
    client.races.upsert.mockResolvedValue(upsertResult);
    const errors: ImportError[] = [];

    const result = await service.upsertRace(data, errors);

    expect(result).toEqual(upsertResult);
    expect(client.races.upsert).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('returns undefined and records an error when the client call fails', async () => {
    client.races.upsert.mockRejectedValue(new Error('conflict'));
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
    client.races.upsert.mockRejectedValue('boom');
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
    client.races.upsert.mockResolvedValue(upsertResult);
    const errors: ImportError[] = [];
    const dataWithEras = {
      name: 'Orc',
      externalIds: [{ externalSystemId: 1, externalId: 'Orc' }],
      eras: [1, 2],
    };

    const result = await service.upsertRace(dataWithEras, errors);

    expect(result).toEqual(upsertResult);
    expect(client.races.upsert).toHaveBeenCalledWith(dataWithEras);
    expect(errors).toHaveLength(0);
  });
});
