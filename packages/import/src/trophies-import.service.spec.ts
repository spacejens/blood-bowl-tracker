import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { TrophiesImportService } from './trophies-import.service';

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

  it('names the trophy in its error message', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.upsert(data, []);

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

    await service.upsert(data, []);

    await runner.recordUpsertResult.mock.calls[0][0].upsert();
    expect(client.trophies.upsert).toHaveBeenCalledWith(data);
  });

  it('falls back to the external id when the payload has no name', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.upsert(
      { externalIds: [{ externalSystemId: 1, externalId: 'Top Scorer' }] },
      [],
    );

    const options = runner.recordUpsertResult.mock.calls[0][0];
    expect(options.buildErrorMessage(new Error('boom'))).toBe(
      'Failed to import trophy "Top Scorer": boom',
    );
  });

  describe('resolveByName', () => {
    it('answers the trophy id when the name matches exactly one row', async () => {
      runner.recordUpsertResult.mockResolvedValue({ found: true, id: 31 });

      await expect(service.resolveByName('Season MVP', [])).resolves.toBe(31);

      await runner.recordUpsertResult.mock.calls[0][0].upsert();
      expect(client.trophies.resolveByName).toHaveBeenCalledWith({
        name: 'Season MVP',
      });
    });

    it('answers undefined for a name no trophy carries', async () => {
      runner.recordUpsertResult.mockResolvedValue({ found: false });

      await expect(
        service.resolveByName('Nonesuch', []),
      ).resolves.toBeUndefined();
    });

    it('answers undefined when the call itself failed', async () => {
      runner.recordUpsertResult.mockResolvedValue(undefined);

      await expect(
        service.resolveByName('Season MVP', []),
      ).resolves.toBeUndefined();
      const options = runner.recordUpsertResult.mock.calls[0][0];
      expect(options.buildErrorMessage(new Error('boom'))).toBe(
        'Failed to resolve trophy "Season MVP": boom',
      );
      expect(options.buildErrorMessage('plain string')).toBe(
        'Failed to resolve trophy "Season MVP": plain string',
      );
    });
  });

  it('falls back to a placeholder when the payload has neither', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.upsert({ externalIds: [] }, []);

    const options = runner.recordUpsertResult.mock.calls[0][0];
    expect(options.buildErrorMessage(new Error('boom'))).toBe(
      'Failed to import trophy "(unnamed)": boom',
    );
  });
});
