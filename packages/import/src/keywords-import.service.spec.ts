import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { recordUpsertResultOptions } from './import-runner.test-helpers';
import { KeywordsImportService } from './keywords-import.service';
import type { ImportError } from './types';

/**
 * The success/failure plumbing lives in `createUpsertImportServiceBase` and is
 * covered by `upsert-import-service-base.spec.ts`. What is entity-specific
 * here -- and all this suite asserts -- is which client resource the service
 * upserts through, how it words a failure.
 */
describe('KeywordsImportService', () => {
  let service: KeywordsImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  const data = {
    name: 'Goblin',
    kind: 'species' as const,
    externalIds: [{ externalSystemId: 1, externalId: '111' }],
  };

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        KeywordsImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(KeywordsImportService);
  });

  it('upserts a keyword through the client', async () => {
    const upserted = {
      id: 7,
      name: 'Goblin',
      kind: 'species' as const,
      createdAt: new Date(),
      created: true,
    };
    runner.recordUpsertResult.mockResolvedValue(upserted);
    client.keywords.upsert.mockResolvedValue(upserted);
    const errors: ImportError[] = [];

    const result = await service.upsert(data, errors);

    expect(result).toBe(upserted);
    const options = recordUpsertResultOptions(runner);
    expect(options.item).toBe(data);
    expect(options.errors).toBe(errors);
    await expect(options.upsert()).resolves.toBe(upserted);
    expect(client.keywords.upsert).toHaveBeenCalledWith(data);
  });

  it('records an error naming the keyword when the upsert fails', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.upsert(data, []);

    const { buildErrorMessage } = recordUpsertResultOptions(runner);
    expect(buildErrorMessage(new Error('boom'))).toBe(
      'Failed to import keyword "Goblin": boom',
    );
    expect(buildErrorMessage('boom')).toBe(
      'Failed to import keyword "Goblin": boom',
    );
  });
});
