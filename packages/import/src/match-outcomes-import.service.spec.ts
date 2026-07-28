import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type DeepMockProxy,
  mock,
  mockDeep,
  type MockProxy,
} from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { MatchOutcomesImportService } from './match-outcomes-import.service';

describe('MatchOutcomesImportService', () => {
  let service: MatchOutcomesImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  const data = { competitionId: 7, overrides: [], tieBreaks: [] };

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        MatchOutcomesImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(MatchOutcomesImportService);
  });

  it('returns the RPC result on success', async () => {
    const expected = {
      competitionId: 7,
      resolvedMatchIds: [1],
      unresolvedMatchIds: [],
    };
    runner.recordUpsertResult.mockResolvedValue(expected);

    await expect(service.resolveOutcomes(data, [])).resolves.toEqual(expected);
  });

  it('names the competition in its error message', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.resolveOutcomes(data, []);

    const options = runner.recordUpsertResult.mock.calls[0][0];
    expect(options.buildErrorMessage(new Error('boom'))).toBe(
      'Failed to resolve match outcomes for competition 7: boom',
    );
    expect(options.item).toEqual({ competitionId: 7 });
  });

  it('calls the RPC procedure through the runner', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.resolveOutcomes(data, []);

    await runner.recordUpsertResult.mock.calls[0][0].upsert();
    expect(client.matches.resolveOutcomes).toHaveBeenCalledWith(data);
  });

  it('uses String(err) for a non-Error rejection in its error message', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.resolveOutcomes(data, []);

    const options = runner.recordUpsertResult.mock.calls[0][0];
    expect(options.buildErrorMessage('boom')).toBe(
      'Failed to resolve match outcomes for competition 7: boom',
    );
  });
});
