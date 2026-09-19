import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { stubImportRunner } from './import-runner.test-helpers';
import { KeywordsImportService } from './keywords-import.service';
import type { ImportError } from './types';

/**
 * The success/failure plumbing lives in `createUpsertImportServiceBase` and is
 * covered by `upsert-import-service-base.spec.ts`. What is entity-specific
 * here -- and all this suite asserts -- is which client resource the service
 * upserts through, how it words a failure, and the `listKeywords` read it
 * adds.
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
    stubImportRunner(runner);
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
    client.keywords.upsert.mockResolvedValue(upserted);
    const errors: ImportError[] = [];

    const result = await service.upsert(data, errors);

    expect(client.keywords.upsert).toHaveBeenCalledWith(data);
    expect(result).toEqual(upserted);
    expect(errors).toHaveLength(0);
  });

  it('records an error naming the keyword when the upsert fails', async () => {
    client.keywords.upsert.mockRejectedValue(new Error('boom'));
    const errors: ImportError[] = [];

    const result = await service.upsert(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Failed to import keyword "Goblin"');
    expect(errors[0].message).toContain('boom');
  });

  it('reads the catalogue for one external system', async () => {
    const rows = [
      {
        keywordId: 7,
        name: 'Goblin',
        kind: 'species' as const,
        externalId: '111',
      },
    ];
    client.keywords.list.mockResolvedValue(rows);
    const errors: ImportError[] = [];

    const result = await service.listKeywords(1, errors);

    expect(client.keywords.list).toHaveBeenCalledWith({ externalSystemId: 1 });
    expect(result).toEqual(rows);
    expect(errors).toHaveLength(0);
  });

  it('records an error when the catalogue read fails', async () => {
    client.keywords.list.mockRejectedValue(new Error('boom'));
    const errors: ImportError[] = [];

    const result = await service.listKeywords(1, errors);

    expect(result).toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('boom');
  });
});
