import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { stubImportRunner } from './import-runner.test-helpers';
import { MatchOutcomesImportService } from './match-outcomes-import.service';
import type { ImportError } from './types';

async function makeModule() {
  const client = mockDeep<ApiClient>();
  const runner = mock<ImportRunnerService>();
  stubImportRunner(runner);
  const moduleRef = await Test.createTestingModule({
    providers: [
      MatchOutcomesImportService,
      { provide: API_CLIENT, useValue: client },
      { provide: ImportRunnerService, useValue: runner },
    ],
  }).compile();
  return { service: moduleRef.get(MatchOutcomesImportService), client };
}

describe('MatchOutcomesImportService', () => {
  let service: MatchOutcomesImportService;
  let client: DeepMockProxy<ApiClient>;

  beforeEach(async () => {
    ({ service, client } = await makeModule());
  });

  const data = { competitionId: 7, overrides: [], tieBreaks: [] };

  it('returns the RPC result and calls the client with the given data on success', async () => {
    const expected = {
      competitionId: 7,
      resolvedMatchIds: [1],
      unresolvedMatchIds: [],
    };
    client.matches.resolveOutcomes.mockResolvedValue(expected);
    const errors: ImportError[] = [];

    const result = await service.resolveOutcomes(data, errors);

    expect(result).toEqual(expected);
    expect(client.matches.resolveOutcomes).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('resolves to undefined and records an error when the client call fails', async () => {
    client.matches.resolveOutcomes.mockRejectedValue(new Error('conflict'));
    const errors: ImportError[] = [];

    const result = await service.resolveOutcomes(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      {
        item: { competitionId: 7 },
        message: 'Failed to resolve match outcomes for competition 7: conflict',
      },
    ]);
  });

  it('records an error using String(err) for a non-Error rejection', async () => {
    client.matches.resolveOutcomes.mockRejectedValue('boom');
    const errors: ImportError[] = [];

    const result = await service.resolveOutcomes(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      {
        item: { competitionId: 7 },
        message: 'Failed to resolve match outcomes for competition 7: boom',
      },
    ]);
  });
});
