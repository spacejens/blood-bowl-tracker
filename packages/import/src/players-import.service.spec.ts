import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import {
  recordUpsertOptions,
  recordUpsertResultOptions,
} from './import-runner.test-helpers';
import { PlayersImportService } from './players-import.service';
import type { ImportError } from './types';

const upsertResult = {
  id: 1,
  name: 'Griff Oberwald',
  teamEraId: 10,
  positionId: 20,
  move: 6,
  strength: 3,
  agility: 3,
  passing: 4,
  armour: 9,
  missNextGame: false,
  nigglingInjuryCount: 0,
  moveReductionCount: 0,
  strengthReductionCount: 0,
  agilityReductionCount: 0,
  passingReductionCount: 0,
  armourReductionCount: 0,
  moveIncreaseCount: 0,
  strengthIncreaseCount: 0,
  agilityIncreaseCount: 0,
  passingIncreaseCount: 0,
  armourIncreaseCount: 0,
  createdAt: new Date('2026-01-01'),
  created: true,
};

async function makeModule() {
  const client = mockDeep<ApiClient>();
  const runner = mock<ImportRunnerService>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      PlayersImportService,
      { provide: API_CLIENT, useValue: client },
      { provide: ImportRunnerService, useValue: runner },
    ],
  }).compile();
  return { service: moduleRef.get(PlayersImportService), client, runner };
}

describe('PlayersImportService', () => {
  let service: PlayersImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    ({ service, client, runner } = await makeModule());
  });

  const data = {
    name: 'Griff Oberwald',
    teamEraId: 10,
    positionId: 20,
    externalIds: [{ externalSystemId: 1, externalId: '12345' }],
  };

  it('returns true when the runner records success', async () => {
    runner.recordUpsert.mockResolvedValue(true);
    await expect(service.upsertPlayer(data, [])).resolves.toBe(true);
  });

  it('returns false when the runner records a failure', async () => {
    runner.recordUpsert.mockResolvedValue(false);
    await expect(service.upsertPlayer(data, [])).resolves.toBe(false);
  });

  it('hands the runner the data as item, the caller error list, and an upsert that calls the client', async () => {
    runner.recordUpsert.mockResolvedValue(true);
    client.players.upsert.mockResolvedValue(upsertResult);
    const errors: ImportError[] = [];

    await service.upsertPlayer(data, errors);

    const options = recordUpsertOptions(runner);
    expect(options.item).toBe(data);
    expect(options.errors).toBe(errors);
    await options.upsert();
    expect(client.players.upsert).toHaveBeenCalledWith(data);
  });

  it('builds a failure message naming the player', async () => {
    runner.recordUpsert.mockResolvedValue(false);

    await service.upsertPlayer(data, []);

    const { buildErrorMessage } = recordUpsertOptions(runner);
    expect(buildErrorMessage(new Error('conflict'))).toBe(
      'Failed to import player "Griff Oberwald": conflict',
    );
    expect(buildErrorMessage('boom')).toBe(
      'Failed to import player "Griff Oberwald": boom',
    );
  });
});

describe('PlayersImportService.upsertPlayerResult', () => {
  let service: PlayersImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    ({ service, client, runner } = await makeModule());
  });

  const data = {
    name: 'Griff Oberwald',
    teamEraId: 10,
    positionId: 20,
    externalIds: [{ externalSystemId: 1, externalId: '12345' }],
  };

  it('returns the runner result unchanged', async () => {
    runner.recordUpsertResult.mockResolvedValue(upsertResult);

    const result = await service.upsertPlayerResult(data, []);

    expect(result).toBe(upsertResult);
  });

  it('returns undefined when the runner recorded a failure', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    const result = await service.upsertPlayerResult(data, []);

    expect(result).toBeUndefined();
  });

  it('hands the runner the data as item, the caller error list, and an upsert that calls the client', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);
    client.players.upsert.mockResolvedValue(upsertResult);
    const errors: ImportError[] = [];

    await service.upsertPlayerResult(data, errors);

    const options = recordUpsertResultOptions(runner);
    expect(options.item).toBe(data);
    expect(options.errors).toBe(errors);
    await expect(options.upsert()).resolves.toBe(upsertResult);
    expect(client.players.upsert).toHaveBeenCalledWith(data);
  });

  it('builds a failure message naming the player', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.upsertPlayerResult(data, []);

    const { buildErrorMessage } = recordUpsertResultOptions(runner);
    expect(buildErrorMessage(new Error('conflict'))).toBe(
      'Failed to import player "Griff Oberwald": conflict',
    );
    expect(buildErrorMessage('boom')).toBe(
      'Failed to import player "Griff Oberwald": boom',
    );
  });
});
