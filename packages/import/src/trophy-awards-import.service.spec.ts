import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { TrophyAwardsImportService } from './trophy-awards-import.service';
import type { ImportError } from './types';

describe('TrophyAwardsImportService', () => {
  let service: TrophyAwardsImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TrophyAwardsImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(TrophyAwardsImportService);
  });

  const data = {
    trophyId: 1,
    competitionId: 2,
    teamEraId: 3,
    playerId: 4,
  };

  it('delegates to the import runner and returns its result', async () => {
    const errors: ImportError[] = [];
    runner.recordUpsertResult.mockResolvedValue({ id: 9 });

    const result = await service.upsertTrophyAward(data, errors);

    expect(result).toEqual({ id: 9 });
    expect(runner.recordUpsertResult).toHaveBeenCalledWith(
      expect.objectContaining({ item: data, errors }),
    );
  });

  it('names the trophy, competition and recipient in its error message', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.upsertTrophyAward(data, []);

    const options = runner.recordUpsertResult.mock.calls[0][0];
    expect(options.buildErrorMessage(new Error('boom'))).toBe(
      'Failed to import trophy award (trophy 1, competition 2, team era 3, player 4): boom',
    );
    expect(options.buildErrorMessage('plain string')).toBe(
      'Failed to import trophy award (trophy 1, competition 2, team era 3, player 4): plain string',
    );
  });

  it('says "no player" for a team award', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.upsertTrophyAward({ ...data, playerId: null }, []);

    const options = runner.recordUpsertResult.mock.calls[0][0];
    expect(options.buildErrorMessage(new Error('boom'))).toBe(
      'Failed to import trophy award (trophy 1, competition 2, team era 3, no player): boom',
    );
  });

  it('calls the API client through the runner upsert callback', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.upsertTrophyAward(data, []);

    await runner.recordUpsertResult.mock.calls[0][0].upsert();
    expect(client.trophyAwards.upsert).toHaveBeenCalledWith(data);
  });
});
