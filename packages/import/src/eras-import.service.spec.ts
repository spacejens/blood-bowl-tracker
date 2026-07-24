import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ErasImportService } from './eras-import.service';
import { ImportRunnerService } from './import-runner.service';
import { stubImportRunner } from './import-runner.test-helpers';
import type { ImportError } from './types';

describe('ErasImportService', () => {
  let service: ErasImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    stubImportRunner(runner);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ErasImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(ErasImportService);
  });

  const data = {
    name: 'BB2020',
    leagueId: 10,
    rulesSetIds: [20],
    startDate: '2021-09-01',
    endDate: '2023-06-10',
    externalIds: [{ externalSystemId: 1, externalId: 'BB2020' }],
  };

  it('returns the upserted era on success', async () => {
    client.eras.upsert.mockResolvedValue({
      id: 1,
      name: 'BB2020',
      leagueId: 10,
      rulesSetIds: [20],
      startDate: '2021-09-01',
      endDate: '2023-06-10',
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    const errors: ImportError[] = [];

    const result = await service.upsertEra(data, errors);

    expect(result).toEqual({
      id: 1,
      name: 'BB2020',
      leagueId: 10,
      rulesSetIds: [20],
      startDate: '2021-09-01',
      endDate: '2023-06-10',
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    expect(client.eras.upsert).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('returns false and records an error when the client call fails', async () => {
    client.eras.upsert.mockRejectedValue(new Error('conflict'));
    const errors: ImportError[] = [];

    const result = await service.upsertEra(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      { item: data, message: 'Failed to import era "BB2020": conflict' },
    ]);
  });

  it('records an error using String(err) for a non-Error rejection', async () => {
    client.eras.upsert.mockRejectedValue('boom');
    const errors: ImportError[] = [];

    const result = await service.upsertEra(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      { item: data, message: 'Failed to import era "BB2020": boom' },
    ]);
  });
});
