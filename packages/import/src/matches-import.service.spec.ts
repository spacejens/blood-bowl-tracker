import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { UpsertMatch } from '@blood-bowl-tracker/api-contract';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import type { BatchBuffer } from './batch-buffer.service';
import { BatchBufferService } from './batch-buffer.service';
import { ImportRunnerService } from './import-runner.service';
import { stubImportRunner } from './import-runner.test-helpers';
import { MatchesImportService } from './matches-import.service';
import type { ImportError } from './types';

async function makeModule() {
  const client = mockDeep<ApiClient>();
  const runner = mock<ImportRunnerService>();
  const batchBuffer = mock<BatchBufferService>();
  stubImportRunner(runner);
  const moduleRef = await Test.createTestingModule({
    providers: [
      MatchesImportService,
      { provide: API_CLIENT, useValue: client },
      { provide: ImportRunnerService, useValue: runner },
      { provide: BatchBufferService, useValue: batchBuffer },
    ],
  }).compile();
  return { service: moduleRef.get(MatchesImportService), client, batchBuffer };
}

describe('MatchesImportService', () => {
  let service: MatchesImportService;
  let client: DeepMockProxy<ApiClient>;
  let batchBuffer: MockProxy<BatchBufferService>;

  beforeEach(async () => {
    ({ service, client, batchBuffer } = await makeModule());
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
      category: 'normal',
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

  it('createBatch builds a buffer whose upsertBatch calls the client', async () => {
    const errors: ImportError[] = [];
    const buffer = {} as BatchBuffer<unknown>;
    batchBuffer.create.mockReturnValue(buffer);
    client.matches.upsertBatch.mockResolvedValue([]);

    expect(service.createBatch(errors)).toBe(buffer);

    const options = batchBuffer.create.mock.calls[0][0];
    expect(options.errors).toBe(errors);
    await options.upsertBatch([data]);
    expect(client.matches.upsertBatch).toHaveBeenCalledWith([data]);
  });

  it('createBatch builds the same error message the single-item path uses', () => {
    batchBuffer.create.mockReturnValue({} as BatchBuffer<unknown>);

    service.createBatch([]);

    const options = batchBuffer.create.mock.calls[0][0];
    expect(options.buildErrorMessage(data, 'conflict')).toBe(
      `Failed to import match "${data.externalIds[0].externalId}": conflict`,
    );
  });

  it('addToBatch delegates to the buffer service and returns its count', async () => {
    const buffer = {} as BatchBuffer<UpsertMatch>;
    batchBuffer.add.mockResolvedValue(2);

    await expect(service.addToBatch(buffer, data)).resolves.toBe(2);
    expect(batchBuffer.add).toHaveBeenCalledWith(buffer, data);
  });

  it('flushBatch delegates to the buffer service and returns its count', async () => {
    const buffer = {} as BatchBuffer<UpsertMatch>;
    batchBuffer.flush.mockResolvedValue(5);

    await expect(service.flushBatch(buffer)).resolves.toBe(5);
    expect(batchBuffer.flush).toHaveBeenCalledWith(buffer);
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
      category: 'normal',
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
