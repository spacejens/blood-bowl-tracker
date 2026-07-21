import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { ExternalSystemsImportService } from './external-systems-import.service';
import { ImportRunnerService } from './import-runner.service';

describe('ExternalSystemsImportService', () => {
  it('returns the id from the client on success', async () => {
    const upsertMock = vi.fn().mockResolvedValue({
      id: 1,
      name: 'BBL',
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    const client = {
      externalSystems: { upsert: upsertMock },
    } as unknown as ApiClient;
    const service = new ExternalSystemsImportService(
      client,
      new ImportRunnerService(),
    );

    const id = await service.upsertExternalSystem('BBL', false);

    expect(id).toBe(1);
    expect(upsertMock).toHaveBeenCalledWith({
      name: 'BBL',
      isBookkeeping: false,
    });
  });

  it('throws a descriptive error when the client call fails', async () => {
    const upsertMock = vi.fn().mockRejectedValue(new Error('internal error'));
    const client = {
      externalSystems: { upsert: upsertMock },
    } as unknown as ApiClient;
    const service = new ExternalSystemsImportService(
      client,
      new ImportRunnerService(),
    );

    await expect(service.upsertExternalSystem('BBL', false)).rejects.toThrow(
      'Failed to upsert external system "BBL": internal error',
    );
  });

  it('resolves via real NestJS dependency injection, including the implicit-token ImportRunnerService', async () => {
    const upsertMock = vi.fn().mockResolvedValue({
      id: 1,
      name: 'BBL',
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    const client = {
      externalSystems: { upsert: upsertMock },
    } as unknown as ApiClient;

    const moduleRef = await Test.createTestingModule({
      providers: [
        ExternalSystemsImportService,
        ImportRunnerService,
        { provide: API_CLIENT, useValue: client },
      ],
    }).compile();

    const service = moduleRef.get(ExternalSystemsImportService);

    const id = await service.upsertExternalSystem('BBL', false);

    expect(id).toBe(1);
    expect(upsertMock).toHaveBeenCalledWith({
      name: 'BBL',
      isBookkeeping: false,
    });
  });
});
