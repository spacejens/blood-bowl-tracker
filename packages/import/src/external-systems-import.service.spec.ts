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
    const moduleRef = await Test.createTestingModule({
      providers: [
        ExternalSystemsImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(ExternalSystemsImportService);
  });

  it('delegates to the import runner and returns the id it resolves', async () => {
    runner.upsertExternalSystem.mockResolvedValue(1);

    const id = await service.upsertExternalSystem(
      'BBL',
      'imported_data_source',
    );

    expect(id).toBe(1);
    expect(runner.upsertExternalSystem).toHaveBeenCalledWith(
      expect.any(Function),
      'BBL',
    );
  });

  it('hands the runner an upsert closure that posts the name and category', async () => {
    runner.upsertExternalSystem.mockResolvedValue(1);
    client.externalSystems.upsert.mockResolvedValue({
      id: 1,
      name: 'BBL',
      category: 'imported_data_source',
      createdAt: new Date('2026-01-01'),
      created: true,
    });

    await service.upsertExternalSystem('BBL', 'imported_data_source');

    const [upsert] = runner.upsertExternalSystem.mock.calls[0];
    await upsert();
    expect(client.externalSystems.upsert).toHaveBeenCalledWith({
      name: 'BBL',
      category: 'imported_data_source',
    });
  });

  it('propagates the error the import runner throws', async () => {
    runner.upsertExternalSystem.mockRejectedValue(
      new Error('Failed to upsert external system "BBL": internal error'),
    );

    await expect(
      service.upsertExternalSystem('BBL', 'imported_data_source'),
    ).rejects.toThrow('Failed to upsert external system "BBL": internal error');
  });
});
