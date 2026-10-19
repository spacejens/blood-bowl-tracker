import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { recordUpsertResultOptions } from './import-runner.test-helpers';
import { MatchOutcomesImportService } from './match-outcomes-import.service';
import type { ImportError } from './types';

async function makeModule() {
  const client = mockDeep<ApiClient>();
  const runner = mock<ImportRunnerService>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      MatchOutcomesImportService,
      { provide: API_CLIENT, useValue: client },
      { provide: ImportRunnerService, useValue: runner },
    ],
  }).compile();
  return { service: moduleRef.get(MatchOutcomesImportService), client, runner };
}

describe('MatchOutcomesImportService', () => {
  let service: MatchOutcomesImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    ({ service, client, runner } = await makeModule());
  });

  const data = { competitionId: 7, overrides: [], tieBreaks: [] };

  it('returns the runner result unchanged', async () => {
    const resolved = {
      competitionId: 7,
      resolvedMatchIds: [1],
      unresolvedMatchIds: [],
    };
    runner.recordUpsertResult.mockResolvedValue(resolved);

    const result = await service.resolveOutcomes(data, []);

    expect(result).toBe(resolved);
  });

  it('returns undefined when the runner recorded a failure', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    const result = await service.resolveOutcomes(data, []);

    expect(result).toBeUndefined();
  });

  it('hands the runner the competition id as item, the caller error list, and an upsert that calls the client', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);
    const resolved = {
      competitionId: 7,
      resolvedMatchIds: [1],
      unresolvedMatchIds: [],
    };
    client.matches.resolveOutcomes.mockResolvedValue(resolved);
    const errors: ImportError[] = [];

    await service.resolveOutcomes(data, errors);

    const options = recordUpsertResultOptions(runner);
    expect(options.item).toEqual({ competitionId: 7 });
    expect(options.errors).toBe(errors);
    await expect(options.upsert()).resolves.toBe(resolved);
    expect(client.matches.resolveOutcomes).toHaveBeenCalledWith(data);
  });

  it('builds a failure message naming the competition', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.resolveOutcomes(data, []);

    const { buildErrorMessage } = recordUpsertResultOptions(runner);
    expect(buildErrorMessage(new Error('conflict'))).toBe(
      'Failed to resolve match outcomes for competition 7: conflict',
    );
    expect(buildErrorMessage('boom')).toBe(
      'Failed to resolve match outcomes for competition 7: boom',
    );
  });
});
