import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { stubImportRunner } from './import-runner.test-helpers';
import { PlayersImportService } from './players-import.service';
import type { ImportError } from './types';

async function makeModule() {
  const client = mockDeep<ApiClient>();
  const runner = mock<ImportRunnerService>();
  stubImportRunner(runner);
  const moduleRef = await Test.createTestingModule({
    providers: [
      PlayersImportService,
      { provide: API_CLIENT, useValue: client },
      { provide: ImportRunnerService, useValue: runner },
    ],
  }).compile();
  return { service: moduleRef.get(PlayersImportService), client };
}

describe('PlayersImportService', () => {
  let service: PlayersImportService;
  let client: DeepMockProxy<ApiClient>;

  beforeEach(async () => {
    ({ service, client } = await makeModule());
  });

  const data = {
    name: 'Griff Oberwald',
    teamEraId: 10,
    positionId: 20,
    externalIds: [{ externalSystemId: 1, externalId: '12345' }],
  };

  it('returns true and calls the client with the given data on success', async () => {
    client.players.upsert.mockResolvedValue({
      id: 1,
      name: 'Griff Oberwald',
      teamEraId: 10,
      positionId: 20,
      move: 6,
      strength: 3,
      agility: 3,
      passing: 4,
      armour: 9,
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    const errors: ImportError[] = [];

    const result = await service.upsertPlayer(data, errors);

    expect(result).toBe(true);
    expect(client.players.upsert).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('returns false and records an error when the client call fails', async () => {
    client.players.upsert.mockRejectedValue(new Error('conflict'));
    const errors: ImportError[] = [];

    const result = await service.upsertPlayer(data, errors);

    expect(result).toBe(false);
    expect(errors).toEqual([
      {
        item: data,
        message: 'Failed to import player "Griff Oberwald": conflict',
      },
    ]);
  });

  it('records an error using String(err) when the client rejects with a non-Error value', async () => {
    client.players.upsert.mockRejectedValue('boom');
    const errors: ImportError[] = [];

    const result = await service.upsertPlayer(data, errors);

    expect(result).toBe(false);
    expect(errors).toEqual([
      {
        item: data,
        message: 'Failed to import player "Griff Oberwald": boom',
      },
    ]);
  });
});

describe('PlayersImportService.upsertPlayerResult', () => {
  let service: PlayersImportService;
  let client: DeepMockProxy<ApiClient>;

  beforeEach(async () => {
    ({ service, client } = await makeModule());
  });

  const data = {
    name: 'Griff Oberwald',
    teamEraId: 10,
    positionId: 20,
    externalIds: [{ externalSystemId: 1, externalId: '12345' }],
  };

  it('resolves to the upserted player, including its DB id, on success', async () => {
    client.players.upsert.mockResolvedValue({
      id: 42,
      name: 'Griff Oberwald',
      teamEraId: 10,
      positionId: 20,
      move: 6,
      strength: 3,
      agility: 3,
      passing: 4,
      armour: 9,
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    const errors: ImportError[] = [];

    const result = await service.upsertPlayerResult(data, errors);

    expect(result).toEqual(expect.objectContaining({ id: 42 }));
    expect(client.players.upsert).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('resolves to undefined and records an error when the client call fails', async () => {
    client.players.upsert.mockRejectedValue(new Error('conflict'));
    const errors: ImportError[] = [];

    const result = await service.upsertPlayerResult(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      {
        item: data,
        message: 'Failed to import player "Griff Oberwald": conflict',
      },
    ]);
  });

  it('records an error using String(err) when the client rejects with a non-Error value', async () => {
    client.players.upsert.mockRejectedValue('boom');
    const errors: ImportError[] = [];

    const result = await service.upsertPlayerResult(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      {
        item: data,
        message: 'Failed to import player "Griff Oberwald": boom',
      },
    ]);
  });
});
