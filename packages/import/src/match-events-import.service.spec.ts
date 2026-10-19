import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { UpsertMatchEvent } from '@blood-bowl-tracker/api-contract';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import type { BatchBuffer } from './batch-buffer.service';
import { BatchBufferService } from './batch-buffer.service';
import { ImportRunnerService } from './import-runner.service';
import { recordUpsertOptions } from './import-runner.test-helpers';
import { MatchEventsImportService } from './match-events-import.service';
import type { ImportError } from './types';

describe('MatchEventsImportService', () => {
  let service: MatchEventsImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;
  let batchBuffer: MockProxy<BatchBufferService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    batchBuffer = mock<BatchBufferService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        MatchEventsImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
        { provide: BatchBufferService, useValue: batchBuffer },
      ],
    }).compile();
    service = moduleRef.get(MatchEventsImportService);
  });

  const data = {
    matchId: 10,
    actingTeamEraId: 500,
    actingPlayerId: 9,
    actionType: 'touchdown' as const,
    externalIds: [{ externalSystemId: 1, externalId: '1000-vor-td-0' }],
  };

  const upserted = {
    id: 1,
    matchId: 10,
    actingMatchTeamId: 500,
    consequenceMatchTeamId: null,
    actingPlayerId: 9,
    consequencePlayerId: null,
    actionType: 'touchdown' as const,
    consequenceType: null,
    createdAt: new Date('2026-01-01'),
    created: true,
  };

  it('returns true when the runner records success', async () => {
    runner.recordUpsert.mockResolvedValue(true);
    await expect(service.upsertMatchEvent(data, [])).resolves.toBe(true);
  });

  it('returns false when the runner records a failure', async () => {
    runner.recordUpsert.mockResolvedValue(false);
    await expect(service.upsertMatchEvent(data, [])).resolves.toBe(false);
  });

  it('hands the runner the data as item, the caller error list, and an upsert that calls the client', async () => {
    runner.recordUpsert.mockResolvedValue(true);
    client.matchEvents.upsert.mockResolvedValue(upserted);
    const errors: ImportError[] = [];

    await service.upsertMatchEvent(data, errors);

    const options = recordUpsertOptions(runner);
    expect(options.item).toBe(data);
    expect(options.errors).toBe(errors);
    await options.upsert();
    expect(client.matchEvents.upsert).toHaveBeenCalledWith(data);
  });

  it('builds a failure message naming the match event', async () => {
    runner.recordUpsert.mockResolvedValue(false);

    await service.upsertMatchEvent(data, []);

    const { buildErrorMessage } = recordUpsertOptions(runner);
    expect(buildErrorMessage(new Error('conflict'))).toBe(
      'Failed to import match event "1000-vor-td-0": conflict',
    );
    expect(buildErrorMessage('boom')).toBe(
      'Failed to import match event "1000-vor-td-0": boom',
    );
  });

  it('createBatch builds a buffer whose upsertBatch calls the client', async () => {
    const errors: ImportError[] = [];
    const buffer = {} as BatchBuffer<unknown>;
    batchBuffer.create.mockReturnValue(buffer);
    client.matchEvents.upsertBatch.mockResolvedValue([]);

    expect(service.createBatch(errors)).toBe(buffer);

    const options = batchBuffer.create.mock.calls[0][0];
    expect(options.errors).toBe(errors);
    await options.upsertBatch([data]);
    expect(client.matchEvents.upsertBatch).toHaveBeenCalledWith([data]);
  });

  it('createBatch builds the same error message the single-item path uses', () => {
    batchBuffer.create.mockReturnValue({} as BatchBuffer<unknown>);

    service.createBatch([]);

    const options = batchBuffer.create.mock.calls[0][0];
    expect(options.buildErrorMessage(data, 'conflict')).toBe(
      'Failed to import match event "1000-vor-td-0": conflict',
    );
  });

  it('addToBatch delegates to the buffer service and returns its count', async () => {
    const buffer = {} as BatchBuffer<UpsertMatchEvent>;
    batchBuffer.add.mockResolvedValue(3);

    await expect(service.addToBatch(buffer, data)).resolves.toBe(3);
    expect(batchBuffer.add).toHaveBeenCalledWith(buffer, data);
  });

  it('flushBatch delegates to the buffer service and returns its count', async () => {
    const buffer = {} as BatchBuffer<UpsertMatchEvent>;
    batchBuffer.flush.mockResolvedValue(7);

    await expect(service.flushBatch(buffer)).resolves.toBe(7);
    expect(batchBuffer.flush).toHaveBeenCalledWith(buffer);
  });
});
