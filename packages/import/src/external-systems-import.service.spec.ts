import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ExternalSystemsImportService } from './external-systems-import.service';
import { ImportRunnerService } from './import-runner.service';

describe('ExternalSystemsImportService', () => {
  let service: ExternalSystemsImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    // Mirrors the real ImportRunnerService.upsertExternalSystem implementation
    // (see import-runner.service.ts), so these tests still exercise
    // ExternalSystemsImportService's own upsert-argument/error behaviour
    // instead of asserting against opaque mock return values.
    runner.upsertExternalSystem.mockImplementation(async (upsert, name) => {
      try {
        const result = await upsert();
        return result.id;
      } catch (err) {
        throw new Error(
          `Failed to upsert external system "${name}": ${err instanceof Error ? err.message : String(err)}`,
          { cause: err },
        );
      }
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        ExternalSystemsImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(ExternalSystemsImportService);
  });

  it('returns the id from the client on success', async () => {
    client.externalSystems.upsert.mockResolvedValue({
      id: 1,
      name: 'BBL',
      category: 'imported_data_source',
      createdAt: new Date('2026-01-01'),
      created: true,
    });

    const id = await service.upsertExternalSystem(
      'BBL',
      'imported_data_source',
    );

    expect(id).toBe(1);
    expect(client.externalSystems.upsert).toHaveBeenCalledWith({
      name: 'BBL',
      category: 'imported_data_source',
    });
  });

  it('throws a descriptive error when the client call fails', async () => {
    client.externalSystems.upsert.mockRejectedValue(
      new Error('internal error'),
    );

    await expect(
      service.upsertExternalSystem('BBL', 'imported_data_source'),
    ).rejects.toThrow('Failed to upsert external system "BBL": internal error');
  });
});
