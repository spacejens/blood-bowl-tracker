import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { stubImportRunner } from './import-runner.test-helpers';
import { MatchesImportService } from './matches-import.service';
import type { ImportError } from './types';

async function makeModule() {
  const client = mockDeep<ApiClient>();
  const runner = mock<ImportRunnerService>();
  stubImportRunner(runner);
  const moduleRef = await Test.createTestingModule({
    providers: [
      MatchesImportService,
      { provide: API_CLIENT, useValue: client },
      { provide: ImportRunnerService, useValue: runner },
    ],
  }).compile();
  return { service: moduleRef.get(MatchesImportService), client };
}

describe('MatchesImportService', () => {
  let service: MatchesImportService;
  let client: DeepMockProxy<ApiClient>;

  beforeEach(async () => {
    ({ service, client } = await makeModule());
  });

  const data = {
    competitionId: 20,
    playedAt: new Date('2021-09-25'),
    name: 'Test Match',
    externalIds: [{ externalSystemId: 1, externalId: '89' }],
    teamEraIds: [],
  };

  it('returns true and calls the client with the given data on success', async () => {
    client.matches.upsert.mockResolvedValue({
      id: 1,
      competitionId: 20,
      teamEraIds: [],
      name: 'Test Match',
      playedAt: new Date('2021-09-25'),
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    const errors: ImportError[] = [];

    const result = await service.upsertMatch(data, errors);

    expect(result).toBe(true);
    expect(client.matches.upsert).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('returns false and records an error when the client call fails', async () => {
    client.matches.upsert.mockRejectedValue(new Error('conflict'));
    const errors: ImportError[] = [];

    const result = await service.upsertMatch(data, errors);

    expect(result).toBe(false);
    expect(errors).toEqual([
      { item: data, message: 'Failed to import match "89": conflict' },
    ]);
  });

  it('records an error using String(err) for a non-Error rejection', async () => {
    client.matches.upsert.mockRejectedValue('boom');
    const errors: ImportError[] = [];

    const result = await service.upsertMatch(data, errors);

    expect(result).toBe(false);
    expect(errors).toEqual([
      { item: data, message: 'Failed to import match "89": boom' },
    ]);
  });
});

describe('MatchesImportService.upsertMatchResult', () => {
  let service: MatchesImportService;
  let client: DeepMockProxy<ApiClient>;

  beforeEach(async () => {
    ({ service, client } = await makeModule());
  });

  const data = {
    competitionId: 20,
    playedAt: new Date('2021-09-25'),
    name: 'Test Match',
    externalIds: [{ externalSystemId: 1, externalId: '89' }],
    teamEraIds: [],
  };

  it('resolves to the upserted match, including its DB id, on success', async () => {
    client.matches.upsert.mockResolvedValue({
      id: 42,
      competitionId: 20,
      teamEraIds: [],
      name: 'Test Match',
      playedAt: new Date('2021-09-25'),
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    const errors: ImportError[] = [];

    const result = await service.upsertMatchResult(data, errors);

    expect(result).toEqual(expect.objectContaining({ id: 42 }));
    expect(client.matches.upsert).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('resolves to undefined and records an error when the client call fails', async () => {
    client.matches.upsert.mockRejectedValue(new Error('conflict'));
    const errors: ImportError[] = [];

    const result = await service.upsertMatchResult(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      { item: data, message: 'Failed to import match "89": conflict' },
    ]);
  });

  it('records an error using String(err) for a non-Error rejection', async () => {
    client.matches.upsert.mockRejectedValue('boom');
    const errors: ImportError[] = [];

    const result = await service.upsertMatchResult(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      { item: data, message: 'Failed to import match "89": boom' },
    ]);
  });
});
