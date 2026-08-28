import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { stubImportRunner } from './import-runner.test-helpers';
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
        externalIds: Array<{ externalSystemId: number; externalId: string }>;
      },
      { id: number; name: string; createdAt: Date; created: boolean }
    >,
  buildErrorMessage: (
    data: {
      name: string;
      externalIds: Array<{ externalSystemId: number; externalId: string }>;
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
    stubImportRunner(runner);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TestEntityImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(TestEntityImportService);
  });

  it('calls the configured client resource and returns its result', async () => {
    client.leagues.upsert.mockResolvedValue({
      id: 1,
      name: 'Test League',
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    const errors: ImportError[] = [];

    const result = await service.upsert(data, errors);

    expect(result).toEqual({
      id: 1,
      name: 'Test League',
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    expect(client.leagues.upsert).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('records the configured error message and returns undefined on failure', async () => {
    client.leagues.upsert.mockRejectedValue(new Error('conflict'));
    const errors: ImportError[] = [];

    const result = await service.upsert(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      { item: data, message: 'Failed to import thing "Test League": conflict' },
    ]);
  });

  it('stringifies a non-Error rejection in the recorded message', async () => {
    client.leagues.upsert.mockRejectedValue('boom');
    const errors: ImportError[] = [];

    await service.upsert(data, errors);

    expect(errors).toEqual([
      { item: data, message: 'Failed to import thing "Test League": boom' },
    ]);
  });

  it('passes the item and the caller error list through to the runner', async () => {
    client.leagues.upsert.mockResolvedValue({
      id: 1,
      name: 'Test League',
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    const errors: ImportError[] = [];

    await service.upsert(data, errors);

    expect(runner.recordUpsertResult).toHaveBeenCalledWith(
      expect.objectContaining({ item: data, errors }),
    );
  });

  it('exposes the injected client and runner to subclasses', () => {
    expect(service.client).toBe(client);
    expect(service.importRunner).toBe(runner);
  });
});
