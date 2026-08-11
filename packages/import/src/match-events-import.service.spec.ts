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
import { stubImportRunner } from './import-runner.test-helpers';
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
    stubImportRunner(runner);
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

  it('returns true and calls the client on success', async () => {
    client.matchEvents.upsert.mockResolvedValue({
      id: 1,
      matchId: 10,
      actingMatchTeamId: 500,
      consequenceMatchTeamId: null,
      actingPlayerId: 9,
      consequencePlayerId: null,
      actionType: 'touchdown',
      consequenceType: null,
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    const errors: ImportError[] = [];

    const result = await service.upsertMatchEvent(data, errors);

    expect(result).toBe(true);
    expect(client.matchEvents.upsert).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('returns false and records an error on failure', async () => {
    client.matchEvents.upsert.mockRejectedValue(new Error('conflict'));
    const errors: ImportError[] = [];

    const result = await service.upsertMatchEvent(data, errors);

    expect(result).toBe(false);
    expect(errors).toEqual([
      {
        item: data,
        message: 'Failed to import match event "1000-vor-td-0": conflict',
      },
    ]);
  });

  it('records an error using String(err) for a non-Error rejection', async () => {
    client.matchEvents.upsert.mockRejectedValue('boom');
    const errors: ImportError[] = [];

    const result = await service.upsertMatchEvent(data, errors);

    expect(result).toBe(false);
    expect(errors).toEqual([
      {
        item: data,
        message: 'Failed to import match event "1000-vor-td-0": boom',
      },
    ]);
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
