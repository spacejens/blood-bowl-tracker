import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { stubImportRunner } from './import-runner.test-helpers';
import { MatchEventsImportService } from './match-events-import.service';
import type { ImportError } from './types';

describe('MatchEventsImportService', () => {
  let service: MatchEventsImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    stubImportRunner(runner);
    const moduleRef = await Test.createTestingModule({
      providers: [
        MatchEventsImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
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
});
