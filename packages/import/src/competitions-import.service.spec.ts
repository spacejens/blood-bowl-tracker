import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { CompetitionsImportService } from './competitions-import.service';
import { ImportRunnerService } from './import-runner.service';
import {
  recordUpsertOptions,
  recordUpsertResultOptions,
} from './import-runner.test-helpers';
import type { ImportError } from './types';

async function makeModule() {
  const client = mockDeep<ApiClient>();
  const runner = mock<ImportRunnerService>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      CompetitionsImportService,
      { provide: API_CLIENT, useValue: client },
      { provide: ImportRunnerService, useValue: runner },
    ],
  }).compile();
  return { service: moduleRef.get(CompetitionsImportService), client, runner };
}

const data = {
  name: 'Major Season 24',
  type: 'season' as const,
  eraId: 20,
  teamEraIds: [],
  externalIds: [{ externalSystemId: 1, externalId: '73' }],
};

const upsertedCompetition = {
  id: 42,
  name: 'Major Season 24',
  type: 'season' as const,
  eraId: 20,
  teamEraIds: [],
  startDate: '2024-01-15',
  endDate: null,
  competitionGroupId: 3,
  createdAt: new Date('2026-01-01'),
  created: true,
};

describe('CompetitionsImportService', () => {
  let service: CompetitionsImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    ({ service, client, runner } = await makeModule());
  });

  it('returns true when the runner records success', async () => {
    runner.recordUpsert.mockResolvedValue(true);
    await expect(service.upsertCompetition(data, [])).resolves.toBe(true);
  });

  it('returns false when the runner records a failure', async () => {
    runner.recordUpsert.mockResolvedValue(false);
    await expect(service.upsertCompetition(data, [])).resolves.toBe(false);
  });

  it('hands the runner the data as item, the caller error list, and an upsert that calls the client', async () => {
    runner.recordUpsert.mockResolvedValue(true);
    client.competitions.upsert.mockResolvedValue(upsertedCompetition);
    const errors: ImportError[] = [];

    await service.upsertCompetition(data, errors);

    const options = recordUpsertOptions(runner);
    expect(options.item).toBe(data);
    expect(options.errors).toBe(errors);
    await options.upsert();
    expect(client.competitions.upsert).toHaveBeenCalledWith(data);
  });

  it('builds a failure message naming the competition', async () => {
    runner.recordUpsert.mockResolvedValue(false);

    await service.upsertCompetition(data, []);

    const { buildErrorMessage } = recordUpsertOptions(runner);
    expect(buildErrorMessage(new Error('conflict'))).toBe(
      'Failed to import competition "Major Season 24": conflict',
    );
    expect(buildErrorMessage('boom')).toBe(
      'Failed to import competition "Major Season 24": boom',
    );
  });
});

describe('CompetitionsImportService.upsertCompetitionResult', () => {
  let service: CompetitionsImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    ({ service, client, runner } = await makeModule());
  });

  it('returns the runner result unchanged', async () => {
    runner.recordUpsertResult.mockResolvedValue(upsertedCompetition);

    const result = await service.upsertCompetitionResult(data, []);

    expect(result).toBe(upsertedCompetition);
  });

  it('returns undefined when the runner recorded a failure', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    const result = await service.upsertCompetitionResult(data, []);

    expect(result).toBeUndefined();
  });

  it('hands the runner the data as item, the caller error list, and an upsert that calls the client', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);
    client.competitions.upsert.mockResolvedValue(upsertedCompetition);
    const errors: ImportError[] = [];

    await service.upsertCompetitionResult(data, errors);

    const options = recordUpsertResultOptions(runner);
    expect(options.item).toBe(data);
    expect(options.errors).toBe(errors);
    await expect(options.upsert()).resolves.toBe(upsertedCompetition);
    expect(client.competitions.upsert).toHaveBeenCalledWith(data);
  });

  it('builds a failure message naming the competition', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.upsertCompetitionResult(data, []);

    const { buildErrorMessage } = recordUpsertResultOptions(runner);
    expect(buildErrorMessage(new Error('conflict'))).toBe(
      'Failed to import competition "Major Season 24": conflict',
    );
    expect(buildErrorMessage('boom')).toBe(
      'Failed to import competition "Major Season 24": boom',
    );
  });
});
