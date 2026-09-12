import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { stubImportRunner } from './import-runner.test-helpers';
import { MissingTrophyAwardsImportService } from './missing-trophy-awards-import.service';
import type { ImportError } from './types';

async function makeModule() {
  const client = mockDeep<ApiClient>();
  const runner = mock<ImportRunnerService>();
  stubImportRunner(runner);
  const moduleRef = await Test.createTestingModule({
    providers: [
      MissingTrophyAwardsImportService,
      { provide: API_CLIENT, useValue: client },
      { provide: ImportRunnerService, useValue: runner },
    ],
  }).compile();
  return { service: moduleRef.get(MissingTrophyAwardsImportService), client };
}

describe('MissingTrophyAwardsImportService', () => {
  let service: MissingTrophyAwardsImportService;
  let client: DeepMockProxy<ApiClient>;

  beforeEach(async () => {
    ({ service, client } = await makeModule());
  });

  it('records the result of the compute call', async () => {
    const computed = {
      competitionId: 3,
      createdAwardCount: 2,
      awardedTrophyIds: [10],
    };
    client.trophyAwards.computeMissing.mockResolvedValue(computed);

    const errors: ImportError[] = [];
    await expect(
      service.computeMissing({ competitionId: 3 }, errors),
    ).resolves.toEqual(computed);
    expect(errors).toHaveLength(0);
  });

  it('calls the computeMissing procedure', async () => {
    client.trophyAwards.computeMissing.mockResolvedValue({
      competitionId: 7,
      createdAwardCount: 0,
      awardedTrophyIds: [],
    });

    await service.computeMissing({ competitionId: 7 }, []);

    expect(client.trophyAwards.computeMissing).toHaveBeenCalledWith({
      competitionId: 7,
    });
  });

  it('resolves to undefined and records an error when the client call fails', async () => {
    client.trophyAwards.computeMissing.mockRejectedValue(new Error('conflict'));
    const errors: ImportError[] = [];

    const result = await service.computeMissing({ competitionId: 5 }, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      {
        item: { competitionId: 5 },
        message:
          'Failed to compute missing trophy awards for competition 5: conflict',
      },
    ]);
  });

  it('records an error using String(err) for a non-Error rejection', async () => {
    client.trophyAwards.computeMissing.mockRejectedValue('boom');
    const errors: ImportError[] = [];

    const result = await service.computeMissing({ competitionId: 5 }, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      {
        item: { competitionId: 5 },
        message:
          'Failed to compute missing trophy awards for competition 5: boom',
      },
    ]);
  });
});
