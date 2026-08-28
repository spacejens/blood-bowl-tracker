import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { LeaguesImportService } from './leagues-import.service';

/**
 * The success/failure plumbing lives in `createUpsertImportServiceBase` and is
 * covered by `upsert-import-service-base.spec.ts`. What is entity-specific
 * here — and all this suite asserts — is which client resource the service
 * upserts through and how it words a failure.
 */
describe('LeaguesImportService', () => {
  let service: LeaguesImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  const data = {
    name: 'Test League',
    externalIds: [{ externalSystemId: 1, externalId: 'Test League' }],
  };

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        LeaguesImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(LeaguesImportService);
  });

  it('upserts through the leagues resource', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.upsert(data, []);

    await runner.recordUpsertResult.mock.calls[0][0].upsert();
    expect(client.leagues.upsert).toHaveBeenCalledWith(data);
  });

  it('names the league in its error message', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.upsert(data, []);

    const options = runner.recordUpsertResult.mock.calls[0][0];
    expect(options.buildErrorMessage(new Error('conflict'))).toBe(
      'Failed to import league "Test League": conflict',
    );
    expect(options.buildErrorMessage('boom')).toBe(
      'Failed to import league "Test League": boom',
    );
  });
});
