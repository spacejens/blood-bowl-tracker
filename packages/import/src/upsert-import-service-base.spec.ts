import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { ExternalId } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { recordUpsertResultOptions } from './import-runner.test-helpers';
import type { ImportError } from './types';
import type { UpsertResource } from './upsert-import-service-base';
import { createUpsertImportServiceBase } from './upsert-import-service-base';

/**
 * A stand-in entity service built from the factory exactly as the real ones
 * are. `leagues` is only a convenient resource on the mocked client — this
 * suite is about the shared plumbing, not about leagues.
 */
@Injectable()
class TestEntityImportService extends createUpsertImportServiceBase({
  resource: (client: ApiClient) =>
    client.leagues as unknown as UpsertResource<
      {
        name: string;
        externalIds: ExternalId[];
      },
      { id: number; name: string; createdAt: Date; created: boolean }
    >,
  buildErrorMessage: (
    data: {
      name: string;
      externalIds: ExternalId[];
    },
    err,
  ) =>
    `Failed to import thing "${data.name}": ${err instanceof Error ? err.message : String(err)}`,
}) {}

describe('createUpsertImportServiceBase', () => {
  let service: TestEntityImportService;
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
        TestEntityImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(TestEntityImportService);
  });

  const upserted = {
    id: 1,
    name: 'Test League',
    createdAt: new Date('2026-01-01'),
    created: true,
  };

  it('returns the runner result unchanged', async () => {
    runner.recordUpsertResult.mockResolvedValue(upserted);

    const result = await service.upsert(data, []);

    expect(result).toBe(upserted);
  });

  it('returns undefined when the runner recorded a failure', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    const result = await service.upsert(data, []);

    expect(result).toBeUndefined();
  });

  it('passes the item and the caller error list through to the runner', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);
    client.leagues.upsert.mockResolvedValue(upserted);
    const errors: ImportError[] = [];

    await service.upsert(data, errors);

    const options = recordUpsertResultOptions(runner);
    expect(options.item).toBe(data);
    expect(options.errors).toBe(errors);
    await expect(options.upsert()).resolves.toBe(upserted);
    expect(client.leagues.upsert).toHaveBeenCalledWith(data);
  });

  it('builds the configured error message', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.upsert(data, []);

    const { buildErrorMessage } = recordUpsertResultOptions(runner);
    expect(buildErrorMessage(new Error('conflict'))).toBe(
      'Failed to import thing "Test League": conflict',
    );
    expect(buildErrorMessage('boom')).toBe(
      'Failed to import thing "Test League": boom',
    );
  });

  it('exposes the injected client and runner to subclasses', () => {
    expect(service.client).toBe(client);
    expect(service.importRunner).toBe(runner);
  });
});
