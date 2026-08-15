import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { TrophiesImportService } from './trophies-import.service';
import type { ImportError } from './types';

describe('TrophiesImportService', () => {
  let service: TrophiesImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TrophiesImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(TrophiesImportService);
  });

  const data = {
    name: 'Chaos Cup',
    recipientKind: 'team' as const,
    description: null,
    externalIds: [{ externalSystemId: 1, externalId: 'Chaos Cup' }],
  };

  it('delegates to the import runner and returns its result', async () => {
    const errors: ImportError[] = [];
    runner.recordUpsertResult.mockResolvedValue({ id: 12 });

    const result = await service.upsertTrophy(data, errors);

    expect(result).toEqual({ id: 12 });
    expect(runner.recordUpsertResult).toHaveBeenCalledWith(
      expect.objectContaining({ item: data, errors }),
    );
  });

  it('names the trophy in its error message', async () => {
    const errors: ImportError[] = [];
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.upsertTrophy(data, errors);

    const options = runner.recordUpsertResult.mock.calls[0][0];
    expect(options.buildErrorMessage(new Error('boom'))).toBe(
      'Failed to import trophy "Chaos Cup": boom',
    );
    expect(options.buildErrorMessage('plain string')).toBe(
      'Failed to import trophy "Chaos Cup": plain string',
    );
  });

  it('calls the API client through the runner upsert callback', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.upsertTrophy(data, []);

    await runner.recordUpsertResult.mock.calls[0][0].upsert();
    expect(client.trophies.upsert).toHaveBeenCalledWith(data);
  });

  it('falls back to the external id when the payload has no name', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.upsertTrophy(
      { externalIds: [{ externalSystemId: 1, externalId: 'Top Scorer' }] },
      [],
    );

    const options = runner.recordUpsertResult.mock.calls[0][0];
    expect(options.buildErrorMessage(new Error('boom'))).toBe(
      'Failed to import trophy "Top Scorer": boom',
    );
  });

  it('falls back to a placeholder when the payload has neither', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.upsertTrophy({ externalIds: [] }, []);

    const options = runner.recordUpsertResult.mock.calls[0][0];
    expect(options.buildErrorMessage(new Error('boom'))).toBe(
      'Failed to import trophy "(unnamed)": boom',
    );
  });
});
