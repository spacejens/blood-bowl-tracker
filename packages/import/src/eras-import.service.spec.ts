import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ErasImportService } from './eras-import.service';
import { ImportRunnerService } from './import-runner.service';

/**
 * The success/failure plumbing lives in `createUpsertImportServiceBase` and is
 * covered by `upsert-import-service-base.spec.ts`. What is entity-specific
 * here — and all this suite asserts — is which client resource the service
 * upserts through and how it words a failure.
 */
describe('ErasImportService', () => {
  let service: ErasImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  const data = {
    name: 'BB2020',
    leagueId: 10,
    rulesSetIds: [20],
    startDate: '2021-09-01',
    endDate: '2023-06-10',
    externalIds: [{ externalSystemId: 1, externalId: 'BB2020' }],
  };

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ErasImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(ErasImportService);
  });

  it('upserts through the eras resource', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.upsert(data, []);

    await runner.recordUpsertResult.mock.calls[0][0].upsert();
    expect(client.eras.upsert).toHaveBeenCalledWith(data);
  });

  it('names the era in its error message', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.upsert(data, []);

    const options = runner.recordUpsertResult.mock.calls[0][0];
    expect(options.buildErrorMessage(new Error('conflict'))).toBe(
      'Failed to import era "BB2020": conflict',
    );
    expect(options.buildErrorMessage('boom')).toBe(
      'Failed to import era "BB2020": boom',
    );
  });
});
