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
import {
  recordUpsertOptions,
  recordUpsertResultOptions,
} from './import-runner.test-helpers';
import { MatchesImportService } from './matches-import.service';
import type { ImportError } from './types';

async function makeModule() {
  const client = mockDeep<ApiClient>();
  const runner = mock<ImportRunnerService>();
  const batchBuffer = mock<BatchBufferService>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      MatchesImportService,
      { provide: API_CLIENT, useValue: client },
      { provide: ImportRunnerService, useValue: runner },
      { provide: BatchBufferService, useValue: batchBuffer },
    ],
  }).compile();
  return {
    service: moduleRef.get(MatchesImportService),
    client,
    runner,
    batchBuffer,
  };
}

describe('MatchesImportService', () => {
  let service: MatchesImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;
  let batchBuffer: MockProxy<BatchBufferService>;

  beforeEach(async () => {
    ({ service, client, runner, batchBuffer } = await makeModule());
  });

  const data = {
    competitionId: 20,
    playedAt: new Date('2021-09-25'),
    name: 'Test Match',
    externalIds: [{ externalSystemId: 1, externalId: '89' }],
    teamEraIds: [],
  };

  const upserted = {
    id: 1,
    competitionId: 20,
    teamEraIds: [],
    name: 'Test Match',
    category: 'normal' as const,
    playedAt: new Date('2021-09-25'),
    createdAt: new Date('2026-01-01'),
    created: true,
  };

  it('returns true when the runner records success', async () => {
    runner.recordUpsert.mockResolvedValue(true);
    await expect(service.upsertMatch(data, [])).resolves.toBe(true);
  });

  it('returns false when the runner records a failure', async () => {
    runner.recordUpsert.mockResolvedValue(false);
    await expect(service.upsertMatch(data, [])).resolves.toBe(false);
  });

  it('hands the runner the data as item, the caller error list, and an upsert that calls the client', async () => {
    runner.recordUpsert.mockResolvedValue(true);
    client.matches.upsert.mockResolvedValue(upserted);
    const errors: ImportError[] = [];

    await service.upsertMatch(data, errors);

    const options = recordUpsertOptions(runner);
    expect(options.item).toBe(data);
    expect(options.errors).toBe(errors);
    await options.upsert();
    expect(client.matches.upsert).toHaveBeenCalledWith(data);
  });

  it('builds a failure message naming the match', async () => {
    runner.recordUpsert.mockResolvedValue(false);

    await service.upsertMatch(data, []);

    const { buildErrorMessage } = recordUpsertOptions(runner);
    expect(buildErrorMessage(new Error('conflict'))).toBe(
      'Failed to import match "89": conflict',
    );
    expect(buildErrorMessage('boom')).toBe('Failed to import match "89": boom');
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
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    ({ service, client, runner } = await makeModule());
  });

  const data = {
    competitionId: 20,
    playedAt: new Date('2021-09-25'),
    name: 'Test Match',
    externalIds: [{ externalSystemId: 1, externalId: '89' }],
    teamEraIds: [],
  };

  const upserted = {
    id: 42,
    competitionId: 20,
    teamEraIds: [],
    name: 'Test Match',
    category: 'normal' as const,
    playedAt: new Date('2021-09-25'),
    createdAt: new Date('2026-01-01'),
    created: true,
  };

  it('returns the runner result unchanged', async () => {
    runner.recordUpsertResult.mockResolvedValue(upserted);

    const result = await service.upsertMatchResult(data, []);

    expect(result).toBe(upserted);
  });

  it('returns undefined when the runner recorded a failure', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    const result = await service.upsertMatchResult(data, []);

    expect(result).toBeUndefined();
  });

  it('hands the runner the data as item, the caller error list, and an upsert that calls the client', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);
    client.matches.upsert.mockResolvedValue(upserted);
    const errors: ImportError[] = [];

    await service.upsertMatchResult(data, errors);

    const options = recordUpsertResultOptions(runner);
    expect(options.item).toBe(data);
    expect(options.errors).toBe(errors);
    await expect(options.upsert()).resolves.toBe(upserted);
    expect(client.matches.upsert).toHaveBeenCalledWith(data);
  });

  it('builds a failure message naming the match', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.upsertMatchResult(data, []);

    const { buildErrorMessage } = recordUpsertResultOptions(runner);
    expect(buildErrorMessage(new Error('conflict'))).toBe(
      'Failed to import match "89": conflict',
    );
    expect(buildErrorMessage('boom')).toBe('Failed to import match "89": boom');
  });
});
