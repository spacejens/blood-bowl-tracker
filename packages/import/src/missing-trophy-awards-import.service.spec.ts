import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { recordUpsertResultOptions } from './import-runner.test-helpers';
import { MissingTrophyAwardsImportService } from './missing-trophy-awards-import.service';
import type { ImportError } from './types';

async function makeModule() {
  const client = mockDeep<ApiClient>();
  const runner = mock<ImportRunnerService>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      MissingTrophyAwardsImportService,
      { provide: API_CLIENT, useValue: client },
      { provide: ImportRunnerService, useValue: runner },
    ],
  }).compile();
  return {
    service: moduleRef.get(MissingTrophyAwardsImportService),
    client,
    runner,
  };
}

describe('MissingTrophyAwardsImportService', () => {
  let service: MissingTrophyAwardsImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    ({ service, client, runner } = await makeModule());
  });

  it('returns the runner result unchanged', async () => {
    const computed = {
      competitionId: 3,
      createdAwardCount: 2,
      awardedTrophyIds: [10],
    };
    runner.recordUpsertResult.mockResolvedValue(computed);

    const result = await service.computeMissing({ competitionId: 3 }, []);

    expect(result).toBe(computed);
  });

  it('returns undefined when the runner recorded a failure', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    const result = await service.computeMissing({ competitionId: 5 }, []);

    expect(result).toBeUndefined();
  });

  it('hands the runner the competition id as item, the caller error list, and an upsert that calls computeMissing', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);
    const computed = {
      competitionId: 5,
      createdAwardCount: 0,
      awardedTrophyIds: [],
    };
    client.trophyAwards.computeMissing.mockResolvedValue(computed);
    const errors: ImportError[] = [];

    await service.computeMissing({ competitionId: 5 }, errors);

    const options = recordUpsertResultOptions(runner);
    expect(options.item).toEqual({ competitionId: 5 });
    expect(options.errors).toBe(errors);
    await expect(options.upsert()).resolves.toBe(computed);
    expect(client.trophyAwards.computeMissing).toHaveBeenCalledWith({
      competitionId: 5,
    });
  });

  it('builds a failure message naming the competition', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.computeMissing({ competitionId: 5 }, []);

    const { buildErrorMessage } = recordUpsertResultOptions(runner);
    expect(buildErrorMessage(new Error('conflict'))).toBe(
      'Failed to compute missing trophy awards for competition 5: conflict',
    );
    expect(buildErrorMessage('boom')).toBe(
      'Failed to compute missing trophy awards for competition 5: boom',
    );
  });
});
