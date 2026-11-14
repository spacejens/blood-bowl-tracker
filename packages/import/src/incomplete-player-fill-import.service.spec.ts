import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { FillIncompletePlayer } from '@blood-bowl-tracker/api-contract';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { recordUpsertResultOptions } from './import-runner.test-helpers';
import { IncompletePlayerFillImportService } from './incomplete-player-fill-import.service';
import type { ImportError } from './types';

const data: FillIncompletePlayer = {
  playerId: 9,
  status: 'active',
  characteristics: { move: 6, strength: 3, agility: 3, passing: 4, armour: 9 },
  sppTotal: 8,
  unspentSpp: 2,
  startingSkills: [],
  advancements: [],
};

describe('IncompletePlayerFillImportService', () => {
  let service: IncompletePlayerFillImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        IncompletePlayerFillImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(IncompletePlayerFillImportService);
  });

  it("returns the server's outcome", async () => {
    runner.recordUpsertResult.mockResolvedValue({
      playerId: 9,
      outcome: 'filled',
    });

    await expect(service.fill(data, [])).resolves.toEqual({
      playerId: 9,
      outcome: 'filled',
    });
  });

  it('calls players.fillIncomplete through the runner, recording against the data', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);
    const errors: ImportError[] = [];

    await service.fill(data, errors);

    const options = recordUpsertResultOptions(runner);
    expect(options.item).toBe(data);
    expect(options.errors).toBe(errors);
    await options.upsert();
    expect(client.players.fillIncomplete).toHaveBeenCalledWith(data);
  });

  it('names the player in its error message', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.fill(data, []);

    const options = recordUpsertResultOptions(runner);
    expect(
      options.buildErrorMessage(new Error('Player 9 is a star player')),
    ).toBe('Failed to fill in player 9: Player 9 is a star player');
    expect(options.buildErrorMessage('boom')).toBe(
      'Failed to fill in player 9: boom',
    );
  });
});
