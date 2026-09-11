import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { MissingTrophyAwardsImportService } from './missing-trophy-awards-import.service';

describe('MissingTrophyAwardsImportService', () => {
  let service: MissingTrophyAwardsImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        MissingTrophyAwardsImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(MissingTrophyAwardsImportService);
  });

  it('records the result of the compute call', async () => {
    const computed = {
      competitionId: 3,
      createdAwardCount: 2,
      awardedTrophyIds: [10],
    };
    runner.recordUpsertResult.mockResolvedValue(computed);

    const errors: never[] = [];
    await expect(
      service.computeMissing({ competitionId: 3 }, errors),
    ).resolves.toEqual(computed);
  });

  it('calls the computeMissing procedure', async () => {
    runner.recordUpsertResult.mockImplementation(
      async (options: { upsert: () => Promise<unknown> }) =>
        await options.upsert(),
    );

    await service.computeMissing({ competitionId: 7 }, []);

    expect(client.trophyAwards.computeMissing).toHaveBeenCalledWith({
      competitionId: 7,
    });
  });
});
